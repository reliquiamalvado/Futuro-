-- Portões podem ser cadastrados antes do equipamento (vinculado depois).
-- Excluir um equipamento não apaga mais os portões: eles ficam "sem equipamento".

alter table public.gates alter column device_id drop not null;
alter table public.gates drop constraint gates_device_id_fkey;
alter table public.gates add constraint gates_device_id_fkey
  foreign key (device_id) references public.devices(id) on delete set null;

-- O histórico de acionamentos também é mantido ao excluir o equipamento.
alter table public.commands alter column device_id drop not null;
alter table public.commands drop constraint commands_device_id_fkey;
alter table public.commands add constraint commands_device_id_fkey
  foreign key (device_id) references public.devices(id) on delete set null;

alter policy gates_write on public.gates
  using (public.is_org_admin(org_id))
  with check (public.is_org_admin(org_id) and (device_id is null or public.device_org(device_id) = org_id));

-- Lista de portões: inclui os que ainda não têm equipamento (offline, sem acionar).
create or replace function public.my_gates() returns table (
  gate_id uuid, gate_name text, mode text, state text, state_updated_at timestamptz,
  device_id uuid, device_name text, online boolean, last_seen_at timestamptz,
  org_id uuid, org_name text, residence_id uuid, residence_name text, can_operate boolean)
language sql stable security definer set search_path = '' as $$
  select g.id, g.name, g.mode, g.state, g.state_updated_at,
         d.id, d.name, coalesce(public.device_online(d.last_seen_at), false), d.last_seen_at,
         o.id, o.name, ar.residence_id, r.name,
         (ar.residence_id is not null or public.is_org_staff(g.org_id) or public.is_super_admin())
           and g.active and coalesce(d.active, false)
  from public.gates g
  left join public.devices d on d.id = g.device_id
  join public.organizations o on o.id = g.org_id
  left join lateral (select public.gate_access_residence(g.id, auth.uid()) as residence_id) ar on true
  left join public.residences r on r.id = ar.residence_id
  where (ar.residence_id is not null or public.is_org_staff(g.org_id) or public.is_super_admin())
  order by o.name, g.name;
$$;

-- Acionar portão sem equipamento: mensagem clara (nenhum comando é criado).
create or replace function public.enqueue_command(p_gate uuid, p_action text, p_user uuid, p_residence uuid,
                                                  p_source text, p_key uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_gate public.gates%rowtype;
  v_dev public.devices%rowtype;
  v_org_active boolean;
  v_id uuid;
begin
  select * into v_gate from public.gates where id = p_gate;
  if v_gate.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Portão não encontrado.');
  end if;
  if v_gate.device_id is null then
    return jsonb_build_object('ok', false, 'erro', 'Este portão ainda não tem equipamento vinculado.');
  end if;
  select * into v_dev from public.devices where id = v_gate.device_id;
  select active into v_org_active from public.organizations where id = v_gate.org_id;

  if not coalesce(v_gate.active and v_dev.active and v_org_active, false) then
    return jsonb_build_object('ok', false, 'erro', 'Portão ou dispositivo desativado.');
  end if;
  if p_action not in ('abrir','fechar','pulso') then
    return jsonb_build_object('ok', false, 'erro', 'Ação inválida.');
  end if;
  if v_gate.mode = 'pulso' and p_action <> 'pulso' then
    return jsonb_build_object('ok', false, 'erro', 'Este portão só aceita comando de pulso.');
  end if;

  if exists (select 1 from public.commands
             where gate_id = p_gate and status in ('pendente','enviado','sucesso')
               and created_at > now() - interval '2 seconds') then
    return jsonb_build_object('ok', false, 'erro', 'Aguarde um instante antes de acionar novamente.');
  end if;

  if not public.device_online(v_dev.last_seen_at) then
    insert into public.commands (org_id, gate_id, device_id, residence_id, action, status, source,
                                 requested_by, temp_key_id, error, completed_at)
    values (v_gate.org_id, p_gate, v_dev.id, p_residence, p_action, 'falha', p_source,
            p_user, p_key, 'Dispositivo offline', now())
    returning id into v_id;
    return jsonb_build_object('ok', false, 'erro', 'Dispositivo offline.', 'command_id', v_id);
  end if;

  insert into public.commands (org_id, gate_id, device_id, residence_id, action, source,
                               requested_by, temp_key_id)
  values (v_gate.org_id, p_gate, v_dev.id, p_residence, p_action, p_source, p_user, p_key)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'command_id', v_id);
end $$;

-- Chave temporária: portões sem equipamento aparecem como offline.
create or replace function public.guest_key_info(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_key public.temp_keys%rowtype;
begin
  select * into v_key from public.temp_keys where token = p_token;
  if not found then return null; end if;
  return jsonb_build_object(
    'label', v_key.label,
    'residencia', (select name from public.residences where id = v_key.residence_id),
    'valid_from', v_key.valid_from, 'valid_until', v_key.valid_until,
    'daily_start', v_key.daily_start, 'daily_end', v_key.daily_end, 'weekdays', v_key.weekdays,
    'usos', v_key.uses, 'max_usos', v_key.max_uses,
    'bloqueio', public.temp_key_check(v_key),
    'portoes', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', g.id, 'nome', g.name, 'modo', g.mode, 'estado', g.state,
                  'online', coalesce(public.device_online(d.last_seen_at), false)) order by g.name)
               from public.gates g left join public.devices d on d.id = g.device_id
               where g.id = any (v_key.gate_ids) and g.active), '[]'::jsonb));
end $$;
