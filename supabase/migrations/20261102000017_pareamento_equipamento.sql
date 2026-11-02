-- Pareamento do equipamento sem editar código: o app mostra um código de 8 caracteres,
-- a pessoa digita no ESP32 (pelo celular) e o equipamento recebe as próprias credenciais.

create table public.device_pairings (
  code_hash   text primary key,
  device_id   uuid not null references public.devices(id) on delete cascade,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index on public.device_pairings (device_id);
create index on public.device_pairings (created_by);
alter table public.device_pairings enable row level security;
revoke all on public.device_pairings from anon, authenticated;

-- Admin gera o código (vale 30 minutos, uso único). Gerar de novo invalida o anterior.
create function public.create_pairing_code(p_device uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_code text; v_exp timestamptz := now() + interval '30 minutes';
begin
  select org_id into v_org from public.devices where id = p_device;
  if v_org is null or not public.is_org_admin(v_org) then raise exception 'Sem permissão.'; end if;
  delete from public.device_pairings where device_id = p_device and used_at is null;
  v_code := public.random_code(8);
  insert into public.device_pairings (code_hash, device_id, expires_at, created_by)
  values (encode(extensions.digest(v_code, 'sha256'), 'hex'), p_device, v_exp, auth.uid());
  return jsonb_build_object('codigo', v_code, 'expira_em', v_exp);
end $$;

-- Chamado pela Edge Function quando o ESP32 envia o código. Gera um segredo novo
-- (o anterior deixa de valer) e devolve as credenciais uma única vez.
create function public.pair_device(p_code text, p_ip text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_p public.device_pairings%rowtype; v_secret text; v_org uuid;
begin
  -- Força bruta: 20 códigos errados por IP em 10 minutos bloqueiam.
  if (select count(*) from public.audit_logs
      where action = 'dispositivo.pareamento_falhou' and details->>'ip' = coalesce(p_ip, '')
        and created_at > now() - interval '10 minutes') >= 20 then
    return jsonb_build_object('ok', false, 'erro', 'muitas tentativas, aguarde');
  end if;

  select * into v_p from public.device_pairings
   where code_hash = encode(extensions.digest(upper(trim(coalesce(p_code, ''))), 'sha256'), 'hex')
   for update;
  if not found or v_p.used_at is not null or v_p.expires_at <= now() then
    insert into public.audit_logs (action, severity, details)
    values ('dispositivo.pareamento_falhou', 'alerta', jsonb_build_object('ip', coalesce(p_ip, '')));
    return jsonb_build_object('ok', false, 'erro', 'código inválido ou expirado');
  end if;

  v_secret := encode(extensions.gen_random_bytes(24), 'hex');
  update public.device_secrets
     set secret_hash = encode(extensions.digest(v_secret, 'sha256'), 'hex'), rotated_at = now()
   where device_id = v_p.device_id;
  update public.device_pairings set used_at = now() where code_hash = v_p.code_hash;
  select org_id into v_org from public.devices where id = v_p.device_id;
  insert into public.audit_logs (org_id, action, entity, entity_id, severity, details)
  values (v_org, 'dispositivo.pareado', 'devices', v_p.device_id, 'info', jsonb_build_object('ip', coalesce(p_ip, '')));
  return jsonb_build_object('ok', true, 'device_id', v_p.device_id, 'secret', v_secret);
end $$;

revoke execute on function public.create_pairing_code(uuid) from public, anon;
grant execute on function public.create_pairing_code(uuid) to authenticated;
revoke execute on function public.pair_device(text, text) from public, anon, authenticated;
grant execute on function public.pair_device(text, text) to service_role;
