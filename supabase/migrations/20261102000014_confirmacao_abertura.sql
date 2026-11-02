-- Confirmação obrigatória para acionar portões: senha de abertura (PIN) ou biometria (WebAuthn).
-- Protege o caso de celular roubado com o app aberto.

-- ---------------------------------------------------------------- tabelas
create table public.gate_pins (
  user_id       uuid primary key references public.profiles(id) on delete cascade,
  pin_hash      text not null,
  failed        integer not null default 0,
  locked_until  timestamptz,
  updated_at    timestamptz not null default now()
);

create table public.webauthn_credentials (
  id            text primary key,                 -- credential id (base64url)
  user_id       uuid not null references public.profiles(id) on delete cascade,
  public_key    text not null,                    -- chave pública COSE (base64url)
  counter       bigint not null default 0,
  transports    text[],
  device_name   text check (device_name is null or length(device_name) <= 80),
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);
create index on public.webauthn_credentials (user_id);

create table public.webauthn_challenges (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('registro','abertura')),
  challenge   text not null,
  expires_at  timestamptz not null,
  primary key (user_id, kind)
);

create table public.unlock_tickets (
  token_hash  text primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  expires_at  timestamptz not null,
  used_at     timestamptz
);
create index on public.unlock_tickets (user_id);

alter table public.gate_pins enable row level security;
alter table public.webauthn_credentials enable row level security;
alter table public.webauthn_challenges enable row level security;
alter table public.unlock_tickets enable row level security;
revoke all on public.gate_pins, public.webauthn_challenges, public.unlock_tickets from anon, authenticated;
revoke all on public.webauthn_credentials from anon;
revoke insert, update on public.webauthn_credentials from authenticated;

-- O usuário vê e remove as próprias digitais/rostos (a chave pública não é segredo).
create policy wc_select on public.webauthn_credentials for select to authenticated
  using (user_id = (select auth.uid()));
create policy wc_delete on public.webauthn_credentials for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- auxiliares
-- Login recente: a sessão foi criada (senha/Google digitados) há poucos minutos.
create function public.session_is_fresh(p_minutes integer default 10) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.sessions s
    where s.id = nullif(auth.jwt()->>'session_id', '')::uuid
      and s.user_id = auth.uid()
      and s.created_at > now() - make_interval(mins => p_minutes));
$$;

create function public.pin_is_weak(p_pin text) returns boolean
language sql immutable set search_path = '' as $$
  select p_pin ~ '^(\d)\1+$'                                    -- 0000, 1111...
      or position(p_pin in '0123456789012345') > 0              -- 1234, 4567...
      or position(p_pin in '9876543210987654') > 0              -- 4321, 9876...
      or p_pin in ('1212','2580','0852','1004','2000','6969','1122','1313','0101','5683');
$$;

-- Confere o PIN com limite: 5 erros bloqueiam por 15 minutos.
create function public.check_gate_pin(p_user uuid, p_pin text) returns text
language plpgsql security definer set search_path = '' as $$
declare v public.gate_pins%rowtype;
begin
  select * into v from public.gate_pins where user_id = p_user for update;
  if not found then return 'sem_pin'; end if;
  if v.locked_until is not null and v.locked_until > now() then return 'bloqueado'; end if;
  if p_pin is not null and v.pin_hash = extensions.crypt(p_pin, v.pin_hash) then
    update public.gate_pins set failed = 0, locked_until = null where user_id = p_user;
    return 'ok';
  end if;
  if v.failed + 1 >= 5 then
    update public.gate_pins set failed = 0, locked_until = now() + interval '15 minutes' where user_id = p_user;
    insert into public.audit_logs (actor_id, action, entity, entity_id, severity, details)
    values (p_user, 'abertura.senha_bloqueada', 'profiles', p_user, 'critico',
            jsonb_build_object('motivo', '5 senhas de abertura erradas'));
    return 'bloqueado';
  end if;
  update public.gate_pins set failed = v.failed + 1 where user_id = p_user;
  return 'errado';
end $$;

-- ---------------------------------------------------------------- PIN
create function public.set_gate_pin(p_new text, p_current text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_has boolean; v_check text;
begin
  if auth.uid() is null then raise exception 'Não autenticado.'; end if;
  if p_new is null or p_new !~ '^\d{4,8}$' then
    return jsonb_build_object('ok', false, 'erro', 'A senha de abertura deve ter de 4 a 8 números.');
  end if;
  if public.pin_is_weak(p_new) then
    return jsonb_build_object('ok', false, 'erro', 'Senha muito fácil (sequência ou números repetidos). Escolha outra.');
  end if;
  select exists (select 1 from public.gate_pins where user_id = auth.uid()) into v_has;

  -- Trocar: precisa da senha atual OU de login recente. Criar: precisa de login recente.
  if not public.session_is_fresh(10) then
    if not v_has then
      return jsonb_build_object('ok', false, 'reautenticar', true,
        'erro', 'Por segurança, entre novamente na sua conta para criar a senha de abertura.');
    end if;
    v_check := public.check_gate_pin(auth.uid(), p_current);
    if v_check = 'bloqueado' then
      return jsonb_build_object('ok', false, 'erro', 'Muitas tentativas. Aguarde 15 minutos.');
    elsif v_check <> 'ok' then
      return jsonb_build_object('ok', false, 'erro', 'Senha de abertura atual incorreta.');
    end if;
  end if;

  insert into public.gate_pins (user_id, pin_hash, updated_at)
  values (auth.uid(), extensions.crypt(p_new, extensions.gen_salt('bf', 10)), now())
  on conflict (user_id) do update set pin_hash = excluded.pin_hash, failed = 0, locked_until = null, updated_at = now();
  insert into public.audit_logs (actor_id, action, entity, entity_id, severity, details)
  values (auth.uid(), case when v_has then 'abertura.senha_trocada' else 'abertura.senha_criada' end,
          'profiles', auth.uid(), 'info', '{}'::jsonb);
  return jsonb_build_object('ok', true);
end $$;

create function public.my_unlock_methods() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'pin', exists (select 1 from public.gate_pins where user_id = auth.uid()),
    'bloqueado_ate', (select locked_until from public.gate_pins where user_id = auth.uid() and locked_until > now()),
    'biometrias', (select count(*) from public.webauthn_credentials where user_id = auth.uid()),
    'login_recente', public.session_is_fresh(10));
$$;

-- ---------------------------------------------------------------- tíquete (biometria)
-- Emitido pela Edge Function depois de validar a digital/rosto; vale 60 s e uma única vez.
create function public.issue_unlock_ticket(p_user uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  delete from public.unlock_tickets where expires_at < now() - interval '1 hour';
  insert into public.unlock_tickets (token_hash, user_id, expires_at)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), p_user, now() + interval '60 seconds');
  return v_token;
end $$;

create function public.consume_unlock_ticket(p_user uuid, p_ticket text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.unlock_tickets set used_at = now()
   where token_hash = encode(extensions.digest(coalesce(p_ticket, ''), 'sha256'), 'hex')
     and user_id = p_user and used_at is null and expires_at > now();
  return found;
end $$;

-- ---------------------------------------------------------------- acionar com confirmação
drop function public.request_gate_command(uuid, text);

create function public.request_gate_command(p_gate uuid, p_action text, p_pin text default null, p_ticket text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_res uuid;
  v_check text;
begin
  if auth.uid() is null then raise exception 'Não autenticado.'; end if;
  select org_id into v_org from public.gates where id = p_gate;
  if v_org is null then return jsonb_build_object('ok', false, 'erro', 'Portão não encontrado.'); end if;

  v_res := public.gate_access_residence(p_gate, auth.uid());
  if v_res is null and not public.is_org_staff(v_org) then
    perform public.log_event(v_org, 'acionamento.negado', 'alerta',
                             jsonb_build_object('portao', p_gate, 'acao', p_action), 'gates', p_gate);
    return jsonb_build_object('ok', false, 'erro', 'Você não tem permissão para acionar este portão.');
  end if;

  -- Confirmação obrigatória: tíquete de biometria ou senha de abertura.
  if p_ticket is not null then
    if not public.consume_unlock_ticket(auth.uid(), p_ticket) then
      return jsonb_build_object('ok', false, 'confirmacao', 'necessaria', 'erro', 'Confirmação expirada. Tente de novo.');
    end if;
  else
    if not exists (select 1 from public.gate_pins where user_id = auth.uid())
       and not exists (select 1 from public.webauthn_credentials where user_id = auth.uid()) then
      return jsonb_build_object('ok', false, 'confirmacao', 'configurar',
        'erro', 'Crie sua senha de abertura (ou cadastre a digital/rosto) para acionar portões.');
    end if;
    if p_pin is null then
      return jsonb_build_object('ok', false, 'confirmacao', 'necessaria', 'erro', 'Confirme com a digital, o rosto ou a senha de abertura.');
    end if;
    v_check := public.check_gate_pin(auth.uid(), p_pin);
    if v_check = 'bloqueado' then
      return jsonb_build_object('ok', false, 'confirmacao', 'bloqueada',
        'erro', 'Senha de abertura bloqueada por 15 minutos após várias tentativas erradas.');
    elsif v_check = 'sem_pin' then
      return jsonb_build_object('ok', false, 'confirmacao', 'necessaria', 'erro', 'Use a digital ou o rosto para confirmar.');
    elsif v_check <> 'ok' then
      perform public.log_event(v_org, 'acionamento.senha_errada', 'alerta',
                               jsonb_build_object('portao', p_gate), 'gates', p_gate);
      return jsonb_build_object('ok', false, 'confirmacao', 'necessaria', 'erro', 'Senha de abertura incorreta.');
    end if;
  end if;

  return public.enqueue_command(p_gate, p_action, auth.uid(), v_res, 'app', null);
end $$;

-- ---------------------------------------------------------------- permissões
revoke execute on function public.session_is_fresh(integer), public.pin_is_weak(text),
  public.check_gate_pin(uuid, text), public.issue_unlock_ticket(uuid), public.consume_unlock_ticket(uuid, text)
  from public, anon, authenticated;
grant execute on function public.issue_unlock_ticket(uuid), public.session_is_fresh(integer), public.check_gate_pin(uuid, text)
  to service_role;
revoke execute on function public.set_gate_pin(text, text), public.my_unlock_methods(),
  public.request_gate_command(uuid, text, text, text) from public, anon;
grant execute on function public.set_gate_pin(text, text), public.my_unlock_methods(),
  public.request_gate_command(uuid, text, text, text) to authenticated;
