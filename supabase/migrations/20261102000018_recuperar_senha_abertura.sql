-- Senha de abertura esquecida: a pessoa pode recuperar sozinha UMA vez (entrando de novo na conta).
-- Depois disso, só o administrador da casa/condomínio (ou o super admin) libera uma nova.

alter table public.gate_pins add column self_resets_left integer not null default 1
  check (self_resets_left between 0 and 1);

drop function public.set_gate_pin(text, text);

create function public.set_gate_pin(p_new text, p_current text default null, p_esqueci boolean default false)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_has boolean; v_left integer; v_check text;
begin
  if auth.uid() is null then raise exception 'Não autenticado.'; end if;
  if p_new is null or p_new !~ '^\d{4,8}$' then
    return jsonb_build_object('ok', false, 'erro', 'A senha de abertura deve ter de 4 a 8 números.');
  end if;
  if public.pin_is_weak(p_new) then
    return jsonb_build_object('ok', false, 'erro', 'Senha muito fácil (sequência ou números repetidos). Escolha outra.');
  end if;
  select true, self_resets_left into v_has, v_left from public.gate_pins where user_id = auth.uid();
  v_has := coalesce(v_has, false);

  if not v_has then
    -- Criar: precisa de login recente (celular roubado com o app aberto não cria senha).
    if not public.session_is_fresh(10) then
      return jsonb_build_object('ok', false, 'reautenticar', true,
        'erro', 'Por segurança, entre novamente na sua conta para criar a senha de abertura.');
    end if;
    insert into public.gate_pins (user_id, pin_hash, updated_at, self_resets_left)
    values (auth.uid(), extensions.crypt(p_new, extensions.gen_salt('bf', 10)), now(), 1);
    insert into public.audit_logs (actor_id, action, entity, entity_id, severity, details)
    values (auth.uid(), 'abertura.senha_criada', 'profiles', auth.uid(), 'info', '{}'::jsonb);
    return jsonb_build_object('ok', true, 'recuperacoes_restantes', 1);
  end if;

  if p_esqueci then
    -- Esqueci a senha: só com login recente e só se ainda tiver a chance.
    if v_left <= 0 then
      return jsonb_build_object('ok', false, 'precisa_admin', true,
        'erro', 'Você já usou sua chance de recuperar a senha. Peça ao administrador para liberar uma nova.');
    end if;
    if not public.session_is_fresh(10) then
      return jsonb_build_object('ok', false, 'reautenticar', true,
        'erro', 'Por segurança, entre novamente na sua conta para recuperar a senha de abertura.');
    end if;
    update public.gate_pins
       set pin_hash = extensions.crypt(p_new, extensions.gen_salt('bf', 10)), failed = 0, locked_until = null,
           updated_at = now(), self_resets_left = 0
     where user_id = auth.uid();
    insert into public.audit_logs (actor_id, action, entity, entity_id, severity, details)
    values (auth.uid(), 'abertura.senha_recuperada', 'profiles', auth.uid(), 'alerta', '{}'::jsonb);
    return jsonb_build_object('ok', true, 'recuperacoes_restantes', 0);
  end if;

  -- Trocar: sempre com a senha atual.
  v_check := public.check_gate_pin(auth.uid(), p_current);
  if v_check = 'bloqueado' then
    return jsonb_build_object('ok', false, 'erro', 'Muitas tentativas. Aguarde 15 minutos.');
  elsif v_check <> 'ok' then
    return jsonb_build_object('ok', false, 'erro', 'Senha de abertura atual incorreta.');
  end if;
  update public.gate_pins
     set pin_hash = extensions.crypt(p_new, extensions.gen_salt('bf', 10)), failed = 0, locked_until = null, updated_at = now()
   where user_id = auth.uid();
  insert into public.audit_logs (actor_id, action, entity, entity_id, severity, details)
  values (auth.uid(), 'abertura.senha_trocada', 'profiles', auth.uid(), 'info', '{}'::jsonb);
  return jsonb_build_object('ok', true, 'recuperacoes_restantes', v_left);
end $$;

create or replace function public.my_unlock_methods() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'pin', exists (select 1 from public.gate_pins where user_id = auth.uid()),
    'bloqueado_ate', (select locked_until from public.gate_pins where user_id = auth.uid() and locked_until > now()),
    'biometrias', (select count(*) from public.webauthn_credentials where user_id = auth.uid()),
    'login_recente', public.session_is_fresh(10),
    'recuperacoes_restantes', coalesce((select self_resets_left from public.gate_pins where user_id = auth.uid()), 1));
$$;

-- Administrador apaga a senha de abertura de alguém da casa/condomínio. A pessoa cria uma nova
-- (com login recente) e ganha de novo uma chance de recuperação. Ninguém libera a própria senha.
create function public.admin_reset_gate_pin(p_user uuid, p_org uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Não autenticado.'; end if;
  if p_user = auth.uid() then
    return jsonb_build_object('ok', false, 'erro', 'Você não pode liberar a sua própria senha. Peça a outro administrador.');
  end if;
  if not public.is_org_admin(p_org) then raise exception 'Sem permissão.'; end if;
  if not exists (select 1 from public.residence_members m join public.residences r on r.id = m.residence_id
                  where m.user_id = p_user and r.org_id = p_org)
     and not exists (select 1 from public.org_admins a where a.user_id = p_user and a.org_id = p_org) then
    raise exception 'Sem permissão.';
  end if;
  delete from public.gate_pins where user_id = p_user;
  insert into public.audit_logs (org_id, actor_id, action, entity, entity_id, severity, details)
  values (p_org, auth.uid(), 'abertura.senha_liberada_admin', 'profiles', p_user, 'alerta', '{}'::jsonb);
  return jsonb_build_object('ok', true);
end $$;

-- Para a tela de moradores: quem tem senha de abertura e se já usou a chance (sem expor o hash).
create function public.org_pin_status(p_org uuid) returns table (user_id uuid, tem_senha boolean, recuperacoes_restantes integer)
language sql stable security definer set search_path = '' as $$
  select u.user_id, p.user_id is not null, coalesce(p.self_resets_left, 1)
    from (select m.user_id from public.residence_members m join public.residences r on r.id = m.residence_id where r.org_id = p_org
          union select a.user_id from public.org_admins a where a.org_id = p_org) u
    left join public.gate_pins p on p.user_id = u.user_id
   where public.is_org_admin(p_org);
$$;

revoke execute on function public.set_gate_pin(text, text, boolean), public.admin_reset_gate_pin(uuid, uuid),
  public.org_pin_status(uuid) from public, anon;
grant execute on function public.set_gate_pin(text, text, boolean), public.admin_reset_gate_pin(uuid, uuid),
  public.org_pin_status(uuid) to authenticated;
