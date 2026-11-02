-- Segurança: verificação em duas etapas (2FA) aplicada no banco e limites de tentativas.

-- Sessão "forte": quem ativou 2FA precisa estar numa sessão aal2.
create function public.mfa_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors f
                     where f.user_id = auth.uid() and f.status = 'verified');
$$;

-- Super admin: 2FA é obrigatória (sessão aal2).
create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_super_admin from public.profiles p where p.id = auth.uid()), false)
     and coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2';
$$;

create or replace function public.is_org_admin(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_super_admin()
      or (public.mfa_ok()
          and exists (select 1 from public.org_admins a where a.org_id = p_org and a.user_id = auth.uid()));
$$;

create or replace function public.is_org_staff(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.mfa_ok()
     and exists (select 1 from public.org_admins a where a.org_id = p_org and a.user_id = auth.uid());
$$;

create or replace function public.is_residence_member(p_res uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.mfa_ok()
     and exists (select 1 from public.residence_members m
                 where m.residence_id = p_res and m.user_id = auth.uid() and m.status = 'ativo');
$$;

create or replace function public.is_residence_titular(p_res uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.mfa_ok()
     and exists (select 1 from public.residence_members m
                 where m.residence_id = p_res and m.user_id = auth.uid()
                   and m.status = 'ativo' and m.role = 'titular');
$$;

create or replace function public.gate_access_residence(p_gate uuid, p_user uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select m.residence_id
  from public.gate_residences gr
  join public.residence_members m on m.residence_id = gr.residence_id
  where gr.gate_id = p_gate and m.user_id = p_user and p_user = auth.uid() and m.status = 'ativo'
    and (m.allowed_gates is null or p_gate = any (m.allowed_gates))
    and public.mfa_ok()
  order by (m.role = 'titular') desc
  limit 1;
$$;

-- ---------------------------------------------------------------- limites
-- Convites: no máximo 10 códigos inválidos por pessoa por hora.
create or replace function public.redeem_invite(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_inv public.invites%rowtype;
  v_status text;
begin
  if auth.uid() is null then raise exception 'Faça login para usar o convite.'; end if;
  if (select count(*) from public.audit_logs
      where actor_id = auth.uid() and action = 'convite.invalido'
        and created_at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('ok', false, 'erro', 'Muitas tentativas. Aguarde uma hora e tente novamente.');
  end if;

  select * into v_inv from public.invites where code = upper(trim(p_code)) for update;
  if not found or v_inv.revoked or v_inv.expires_at <= now() or v_inv.uses >= v_inv.max_uses then
    perform public.log_event(public.residence_org(v_inv.residence_id), 'convite.invalido', 'alerta',
                             jsonb_build_object('codigo', left(upper(trim(p_code)), 12)));
    return jsonb_build_object('ok', false, 'erro', 'Convite inválido ou expirado.');
  end if;
  if exists (select 1 from public.residence_members
             where residence_id = v_inv.residence_id and user_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'erro', 'Você já faz parte desta residência.');
  end if;
  v_status := case when v_inv.requires_approval then 'pendente' else 'ativo' end;
  insert into public.residence_members (residence_id, user_id, role, status, invite_id, approved_at)
  values (v_inv.residence_id, auth.uid(), v_inv.role, v_status, v_inv.id,
          case when v_status = 'ativo' then now() end);
  update public.invites set uses = uses + 1 where id = v_inv.id;
  return jsonb_build_object('ok', true, 'status', v_status);
end $$;

-- Falhas de autenticação de equipamento: registra no máximo 20 por IP a cada 10 minutos.
create or replace function public.device_auth_failed(p_device uuid, p_ip text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.audit_logs
      where action = 'dispositivo.autenticacao_falhou' and details->>'ip' = coalesce(p_ip, '')
        and created_at > now() - interval '10 minutes') >= 20 then
    return;
  end if;
  insert into public.audit_logs (org_id, action, entity, entity_id, severity, details)
  values ((select org_id from public.devices where id = p_device),
          'dispositivo.autenticacao_falhou', 'devices', p_device, 'critico',
          jsonb_build_object('ip', coalesce(p_ip, '')));
end $$;

-- Chave temporária inexistente: registra no máximo 30 por minuto (evita encher a auditoria).
create or replace function public.guest_request_command(p_token text, p_gate uuid, p_action text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_key public.temp_keys%rowtype;
  v_reason text;
  v_result jsonb;
  v_org uuid;
begin
  select * into v_key from public.temp_keys where token = p_token for update;
  if not found then
    if (select count(*) from public.audit_logs
        where action = 'chave_temporaria.invalida' and created_at > now() - interval '1 minute') < 30 then
      perform public.log_event(null, 'chave_temporaria.invalida', 'alerta', jsonb_build_object('portao', p_gate));
    end if;
    return jsonb_build_object('ok', false, 'erro', 'Chave inválida.');
  end if;
  v_org := public.residence_org(v_key.residence_id);
  v_reason := public.temp_key_check(v_key);
  if v_reason is null and not (p_gate = any (v_key.gate_ids)) then
    v_reason := 'Portão não liberado nesta chave.';
  end if;
  if v_reason is null and not exists (select 1 from public.gate_residences
                                      where gate_id = p_gate and residence_id = v_key.residence_id) then
    v_reason := 'Portão não está mais vinculado à residência.';
  end if;
  if v_reason is not null then
    perform public.log_event(v_org, 'chave_temporaria.negada', 'alerta',
                             jsonb_build_object('chave', v_key.id, 'motivo', v_reason), 'temp_keys', v_key.id);
    return jsonb_build_object('ok', false, 'erro', v_reason);
  end if;

  v_result := public.enqueue_command(p_gate, p_action, null, v_key.residence_id, 'chave_temporaria', v_key.id);
  if (v_result->>'ok')::boolean then
    update public.temp_keys set uses = uses + 1 where id = v_key.id;
  end if;
  return v_result;
end $$;

create index if not exists audit_logs_action_created_idx on public.audit_logs (action, created_at desc);
create index if not exists audit_logs_actor_action_idx on public.audit_logs (actor_id, action, created_at desc);

revoke execute on function public.mfa_ok() from public, anon;
grant execute on function public.mfa_ok() to authenticated;
