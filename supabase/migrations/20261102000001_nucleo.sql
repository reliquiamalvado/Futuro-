-- DigitalControl - núcleo da plataforma
-- Organizações, residências, membros (4 níveis), dispositivos, portões,
-- comandos, convites, chaves temporárias e auditoria.

create extension if not exists pgcrypto with schema extensions;

-- =====================================================================
-- TABELAS
-- =====================================================================

create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 2 and 120),
  kind        text not null default 'condominio' check (kind in ('residencial','condominio','empresa')),
  document    text,
  phone       text,
  email       text,
  address     text,
  timezone    text not null default 'America/Sao_Paulo',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null
);

create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  full_name       text,
  email           text,
  phone           text,
  is_super_admin  boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.org_admins (
  org_id      uuid not null references public.organizations(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (org_id, user_id)
);

create table public.residences (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 80),
  address     text,
  complement  text,
  created_at  timestamptz not null default now()
);

create table public.residence_members (
  id            uuid primary key default gen_random_uuid(),
  residence_id  uuid not null references public.residences(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  role          text not null check (role in ('titular','morador')),
  status        text not null default 'pendente' check (status in ('pendente','ativo','bloqueado')),
  allowed_gates uuid[],              -- null = todos os portões da residência
  invite_id     uuid,
  approved_by   uuid references public.profiles(id) on delete set null,
  approved_at   timestamptz,
  created_at    timestamptz not null default now(),
  unique (residence_id, user_id)
);

-- Catálogo de drivers: cada fabricante/protocolo suportado é uma linha aqui.
create table public.device_drivers (
  id           text primary key,
  name         text not null,
  manufacturer text not null,
  transport    text not null,
  description  text,
  capabilities jsonb not null default '{}'::jsonb,
  active       boolean not null default true
);

create table public.devices (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  name          text not null check (length(trim(name)) between 1 and 80),
  driver_id     text not null references public.device_drivers(id),
  manufacturer  text,
  model         text,
  serial        text,
  config        jsonb not null default '{}'::jsonb,
  last_seen_at  timestamptz,
  firmware      text,
  ip            text,
  rssi          integer,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- Segredos ficam numa tabela sem nenhuma policy: só funções do servidor leem.
create table public.device_secrets (
  device_id    uuid primary key references public.devices(id) on delete cascade,
  secret_hash  text not null,
  rotated_at   timestamptz not null default now()
);

create table public.gates (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  device_id         uuid not null references public.devices(id) on delete cascade,
  name              text not null check (length(trim(name)) between 1 and 80),
  channel           integer not null default 1 check (channel between 1 and 16),
  mode              text not null default 'pulso' check (mode in ('pulso','abrir_fechar')),
  pulse_ms          integer not null default 500 check (pulse_ms between 100 and 10000),
  state             text not null default 'desconhecido'
                    check (state in ('aberto','fechado','movendo','desconhecido')),
  state_updated_at  timestamptz,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  unique (device_id, channel)
);

create table public.gate_residences (
  gate_id       uuid not null references public.gates(id) on delete cascade,
  residence_id  uuid not null references public.residences(id) on delete cascade,
  primary key (gate_id, residence_id)
);

create table public.invites (
  id                 uuid primary key default gen_random_uuid(),
  residence_id       uuid not null references public.residences(id) on delete cascade,
  code               text not null unique,
  role               text not null check (role in ('titular','morador')),
  requires_approval  boolean not null default true,
  max_uses           integer not null default 1 check (max_uses between 1 and 500),
  uses               integer not null default 0,
  expires_at         timestamptz not null,
  revoked            boolean not null default false,
  created_by         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now()
);

create table public.temp_keys (
  id            uuid primary key default gen_random_uuid(),
  residence_id  uuid not null references public.residences(id) on delete cascade,
  label         text not null check (length(trim(label)) between 1 and 80),
  token         text not null unique,
  gate_ids      uuid[] not null check (cardinality(gate_ids) > 0),
  valid_from    timestamptz not null default now(),
  valid_until   timestamptz not null,
  daily_start   time,
  daily_end     time,
  weekdays      integer[],           -- 0=domingo ... 6=sábado; null = todos
  max_uses      integer check (max_uses is null or max_uses between 1 and 1000),
  uses          integer not null default 0,
  revoked_at    timestamptz,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  check (valid_until > valid_from)
);

create table public.commands (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  gate_id       uuid not null references public.gates(id) on delete cascade,
  device_id     uuid not null references public.devices(id) on delete cascade,
  residence_id  uuid references public.residences(id) on delete set null,
  action        text not null check (action in ('abrir','fechar','pulso')),
  status        text not null default 'pendente'
                check (status in ('pendente','enviado','sucesso','falha','expirado')),
  source        text not null default 'app' check (source in ('app','chave_temporaria')),
  requested_by  uuid references public.profiles(id) on delete set null,
  temp_key_id   uuid references public.temp_keys(id) on delete set null,
  error         text,
  created_at    timestamptz not null default now(),
  sent_at       timestamptz,
  completed_at  timestamptz
);

create table public.audit_logs (
  id          bigint generated always as identity primary key,
  org_id      uuid references public.organizations(id) on delete cascade,
  actor_id    uuid references public.profiles(id) on delete set null,
  action      text not null,
  entity      text,
  entity_id   uuid,
  severity    text not null default 'info' check (severity in ('info','alerta','critico')),
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- Índices
create index on public.org_admins (user_id);
create index on public.residences (org_id);
create index on public.residence_members (user_id);
create index on public.devices (org_id);
create index on public.gates (org_id);
create index on public.gates (device_id);
create index on public.gate_residences (residence_id);
create index on public.invites (residence_id);
create index on public.temp_keys (residence_id);
create index commands_device_pending on public.commands (device_id, created_at) where status = 'pendente';
create index on public.commands (gate_id, created_at desc);
create index on public.commands (org_id, created_at desc);
create index on public.commands (requested_by, created_at desc);
create index on public.commands (residence_id, created_at desc);
create index on public.audit_logs (org_id, created_at desc);

-- Driver disponível hoje: firmware DigitalControl para ESP32 via HTTPS.
insert into public.device_drivers (id, name, manufacturer, transport, description, capabilities) values
  ('dc-esp32-https', 'DigitalControl ESP32', 'DigitalControl', 'https',
   'Firmware DigitalControl para ESP32 com módulo relé. Conecta-se à nuvem por HTTPS (long-polling), sem abrir portas no roteador.',
   '{"channels": 4, "pulse": true, "open_close": true, "state_sensor": true}');

-- =====================================================================
-- FUNÇÕES AUXILIARES DE PERMISSÃO
-- =====================================================================

create function public.is_super_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_super_admin from public.profiles p where p.id = auth.uid()), false);
$$;

create function public.is_org_admin(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_super_admin()
      or exists (select 1 from public.org_admins a where a.org_id = p_org and a.user_id = auth.uid());
$$;

-- Admin "de fato" (sem herdar de super admin) - usado para acionar portões.
create function public.is_org_staff(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.org_admins a where a.org_id = p_org and a.user_id = auth.uid());
$$;

create function public.residence_org(p_res uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select r.org_id from public.residences r where r.id = p_res;
$$;

create function public.is_residence_member(p_res uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.residence_members m
                 where m.residence_id = p_res and m.user_id = auth.uid() and m.status = 'ativo');
$$;

create function public.is_residence_titular(p_res uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.residence_members m
                 where m.residence_id = p_res and m.user_id = auth.uid()
                   and m.status = 'ativo' and m.role = 'titular');
$$;

create function public.can_manage_residence(p_res uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_org_admin(public.residence_org(p_res)) or public.is_residence_titular(p_res);
$$;

create function public.is_org_participant(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_org_admin(p_org)
      or exists (select 1 from public.residence_members m
                 join public.residences r on r.id = m.residence_id
                 where r.org_id = p_org and m.user_id = auth.uid() and m.status <> 'bloqueado');
$$;

-- Residência pela qual o usuário pode acionar o portão (null = sem permissão).
create function public.gate_access_residence(p_gate uuid, p_user uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select m.residence_id
  from public.gate_residences gr
  join public.residence_members m on m.residence_id = gr.residence_id
  where gr.gate_id = p_gate and m.user_id = p_user and m.status = 'ativo'
    and (m.allowed_gates is null or p_gate = any (m.allowed_gates))
  order by (m.role = 'titular') desc
  limit 1;
$$;

create function public.can_view_gate(p_gate uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.gates g where g.id = p_gate and public.is_org_admin(g.org_id))
      or exists (select 1 from public.gate_residences gr
                 where gr.gate_id = p_gate and public.is_residence_member(gr.residence_id));
$$;

create function public.device_org(p_device uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select d.org_id from public.devices d where d.id = p_device;
$$;

create function public.can_view_device(p_device uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_org_admin(public.device_org(p_device))
      or exists (select 1 from public.gates g where g.device_id = p_device and public.can_view_gate(g.id));
$$;

create function public.can_view_profile(p_target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_target = auth.uid()
      or public.is_super_admin()
      or exists (select 1 from public.residence_members m
                 join public.residences r on r.id = m.residence_id
                 where m.user_id = p_target
                   and (public.is_org_admin(r.org_id) or public.is_residence_titular(r.id)))
      or exists (select 1 from public.org_admins a
                 where a.user_id = p_target and public.is_org_admin(a.org_id));
$$;

create function public.device_online(p_last_seen timestamptz) returns boolean
language sql stable set search_path = '' as $$
  select p_last_seen is not null and p_last_seen > now() - interval '45 seconds';
$$;

-- =====================================================================
-- PERFIS: criados automaticamente no cadastro
-- =====================================================================

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_first boolean;
begin
  -- O primeiro usuário da plataforma vira SUPER ADMIN.
  select not exists (select 1 from public.profiles where is_super_admin) into v_first;
  insert into public.profiles (id, full_name, email, is_super_admin)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
          new.email,
          v_first);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create function public.handle_user_email_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = new.email, updated_at = now() where id = new.id;
  return new;
end $$;

create trigger on_auth_user_email_changed after update of email on auth.users
for each row when (old.email is distinct from new.email)
execute function public.handle_user_email_change();

-- =====================================================================
-- AUDITORIA: histórico de alterações em todas as tabelas de cadastro
-- =====================================================================

create function public.audit_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_ignore text[] := array['last_seen_at','state','state_updated_at','firmware','ip','rssi',
                           'uses','updated_at','token','secret_hash'];
  v_org uuid;
  v_id uuid;
begin
  if tg_op = 'UPDATE' and (v_old - v_ignore) = (v_new - v_ignore) then
    return null;  -- só telemetria mudou
  end if;

  v_id := nullif(v_row->>'id','')::uuid;
  v_org := case tg_table_name
    when 'organizations'     then (v_row->>'id')::uuid
    when 'org_admins'        then (v_row->>'org_id')::uuid
    when 'residences'        then (v_row->>'org_id')::uuid
    when 'devices'           then (v_row->>'org_id')::uuid
    when 'gates'             then (v_row->>'org_id')::uuid
    when 'residence_members' then public.residence_org((v_row->>'residence_id')::uuid)
    when 'invites'           then public.residence_org((v_row->>'residence_id')::uuid)
    when 'temp_keys'         then public.residence_org((v_row->>'residence_id')::uuid)
    when 'gate_residences'   then public.residence_org((v_row->>'residence_id')::uuid)
  end;

  -- Em exclusões em cascata a organização pode não existir mais.
  if v_org is not null and not exists (select 1 from public.organizations where id = v_org) then
    v_org := null;
  end if;

  insert into public.audit_logs (org_id, actor_id, action, entity, entity_id, details)
  values (v_org,
          auth.uid(),
          tg_table_name || '.' || lower(tg_op),
          tg_table_name,
          v_id,
          jsonb_strip_nulls(jsonb_build_object('antes', v_old - v_ignore, 'depois', v_new - v_ignore)));
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['organizations','org_admins','residences','residence_members','devices',
                           'gates','gate_residences','invites','temp_keys'] loop
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$s
                    for each row execute function public.audit_change()', t);
  end loop;
end $$;

create function public.log_event(p_org uuid, p_action text, p_severity text, p_details jsonb,
                                 p_entity text default null, p_entity_id uuid default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_logs (org_id, actor_id, action, entity, entity_id, severity, details)
  values (p_org, auth.uid(), p_action, p_entity, p_entity_id, p_severity, coalesce(p_details,'{}'::jsonb));
$$;

-- =====================================================================
-- RLS
-- =====================================================================

alter table public.organizations     enable row level security;
alter table public.profiles          enable row level security;
alter table public.org_admins        enable row level security;
alter table public.residences        enable row level security;
alter table public.residence_members enable row level security;
alter table public.device_drivers    enable row level security;
alter table public.devices           enable row level security;
alter table public.device_secrets    enable row level security;
alter table public.gates             enable row level security;
alter table public.gate_residences   enable row level security;
alter table public.invites           enable row level security;
alter table public.temp_keys         enable row level security;
alter table public.commands          enable row level security;
alter table public.audit_logs        enable row level security;

-- Visitantes anônimos não acessam tabelas: só as funções de chave temporária.
revoke all on all tables in schema public from anon;

-- organizations
create policy org_select on public.organizations for select to authenticated
  using (public.is_org_participant(id));
create policy org_insert on public.organizations for insert to authenticated
  with check (public.is_super_admin());
create policy org_update on public.organizations for update to authenticated
  using (public.is_org_admin(id)) with check (public.is_org_admin(id));
create policy org_delete on public.organizations for delete to authenticated
  using (public.is_super_admin());
-- Só o super admin ativa/desativa clientes.
create function public.guard_org_active() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.active is distinct from old.active and not public.is_super_admin() then
    raise exception 'Apenas o super admin pode ativar ou desativar clientes.';
  end if;
  return new;
end $$;
create trigger guard_org_active before update on public.organizations
for each row execute function public.guard_org_active();

-- profiles (usuário só altera nome e telefone)
create policy profiles_select on public.profiles for select to authenticated
  using (public.can_view_profile(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke insert, update, delete on public.profiles from authenticated;
grant update (full_name, phone) on public.profiles to authenticated;

-- org_admins
create policy oa_select on public.org_admins for select to authenticated
  using (user_id = auth.uid() or public.is_org_admin(org_id));
create policy oa_delete on public.org_admins for delete to authenticated
  using (public.is_super_admin());
revoke insert, update on public.org_admins from authenticated;

-- residences
create policy res_select on public.residences for select to authenticated
  using (public.is_org_admin(org_id) or public.is_residence_member(id)
         or exists (select 1 from public.residence_members m
                    where m.residence_id = residences.id and m.user_id = auth.uid()));
create policy res_write on public.residences for all to authenticated
  using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));

-- residence_members
create policy rm_select on public.residence_members for select to authenticated
  using (user_id = auth.uid() or public.can_manage_residence(residence_id));
create policy rm_update on public.residence_members for update to authenticated
  using (public.is_org_admin(public.residence_org(residence_id))
         or (role = 'morador' and public.is_residence_titular(residence_id)))
  with check (public.is_org_admin(public.residence_org(residence_id))
         or (role = 'morador' and public.is_residence_titular(residence_id)));
create policy rm_delete on public.residence_members for delete to authenticated
  using (user_id = auth.uid()
         or public.is_org_admin(public.residence_org(residence_id))
         or (role = 'morador' and public.is_residence_titular(residence_id)));
revoke insert on public.residence_members from authenticated;
revoke update on public.residence_members from authenticated;
grant update (status, allowed_gates, role) on public.residence_members to authenticated;

-- Registra quem aprovou e impede que titular promova moradores.
create function public.guard_member_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.role <> old.role and not public.is_org_admin(public.residence_org(new.residence_id)) then
    raise exception 'Apenas o administrador pode alterar o papel de um membro.';
  end if;
  if new.user_id = auth.uid() and new.status <> old.status
     and not public.is_org_admin(public.residence_org(new.residence_id)) then
    raise exception 'Você não pode alterar o próprio status.';
  end if;
  if new.status = 'ativo' and old.status <> 'ativo' then
    new.approved_by := auth.uid();
    new.approved_at := now();
  end if;
  return new;
end $$;
create trigger guard_member_update before update on public.residence_members
for each row execute function public.guard_member_update();

-- device_drivers
create policy drivers_select on public.device_drivers for select to authenticated using (true);
revoke insert, update, delete on public.device_drivers from authenticated;

-- devices
create policy dev_select on public.devices for select to authenticated
  using (public.can_view_device(id));
create policy dev_update on public.devices for update to authenticated
  using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));
create policy dev_delete on public.devices for delete to authenticated
  using (public.is_org_admin(org_id));
revoke insert on public.devices from authenticated;
revoke update on public.devices from authenticated;
grant update (name, manufacturer, model, serial, config, active) on public.devices to authenticated;

-- device_secrets: nenhuma policy (inacessível pelo app)
revoke all on public.device_secrets from authenticated;

-- gates
create policy gates_select on public.gates for select to authenticated
  using (public.can_view_gate(id));
create policy gates_write on public.gates for all to authenticated
  using (public.is_org_admin(org_id))
  with check (public.is_org_admin(org_id) and public.device_org(device_id) = org_id);
revoke update on public.gates from authenticated;
grant update (name, channel, mode, pulse_ms, active, device_id) on public.gates to authenticated;

-- gate_residences
create policy gr_select on public.gate_residences for select to authenticated
  using (public.is_org_admin(public.residence_org(residence_id)) or public.is_residence_member(residence_id));
create policy gr_write on public.gate_residences for all to authenticated
  using (public.is_org_admin(public.residence_org(residence_id)))
  with check (public.is_org_admin(public.residence_org(residence_id))
              and exists (select 1 from public.gates g
                          where g.id = gate_residences.gate_id
                            and g.org_id = public.residence_org(gate_residences.residence_id)));

-- invites
create policy inv_select on public.invites for select to authenticated
  using (public.can_manage_residence(residence_id));
create policy inv_update on public.invites for update to authenticated
  using (public.can_manage_residence(residence_id)) with check (public.can_manage_residence(residence_id));
create policy inv_delete on public.invites for delete to authenticated
  using (public.can_manage_residence(residence_id));
revoke insert, update on public.invites from authenticated;
grant update (revoked) on public.invites to authenticated;

-- temp_keys
create policy tk_select on public.temp_keys for select to authenticated
  using (public.can_manage_residence(residence_id));
create policy tk_update on public.temp_keys for update to authenticated
  using (public.can_manage_residence(residence_id)) with check (public.can_manage_residence(residence_id));
revoke insert, update on public.temp_keys from authenticated;
grant update (revoked_at) on public.temp_keys to authenticated;

-- commands (somente leitura pelo app; criação via função)
create policy cmd_select on public.commands for select to authenticated
  using (requested_by = auth.uid()
         or public.is_org_admin(org_id)
         or (residence_id is not null and public.is_residence_titular(residence_id)));
revoke insert, update, delete on public.commands from authenticated;

-- audit_logs
create policy audit_select on public.audit_logs for select to authenticated
  using (public.is_super_admin() or (org_id is not null and public.is_org_admin(org_id)));
revoke insert, update, delete on public.audit_logs from authenticated;

-- =====================================================================
-- FUNÇÕES DE NEGÓCIO (chamadas pelo app)
-- =====================================================================

create function public.random_code(p_len integer) returns text
language plpgsql volatile set search_path = '' as $$
declare
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea := extensions.gen_random_bytes(p_len);
  v_out text := '';
begin
  for i in 0 .. p_len - 1 loop
    v_out := v_out || substr(v_chars, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  return v_out;
end $$;

-- Super admin: vincula administrador a uma organização pelo e-mail.
create function public.add_org_admin(p_org uuid, p_email text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
  if not public.is_super_admin() then raise exception 'Sem permissão.'; end if;
  select id into v_user from public.profiles where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'Nenhum usuário cadastrado com este e-mail. Peça para a pessoa criar a conta primeiro.';
  end if;
  insert into public.org_admins (org_id, user_id) values (p_org, v_user) on conflict do nothing;
  return v_user;
end $$;

-- Super admin: concede/remove super admin.
create function public.set_super_admin(p_user uuid, p_value boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_super_admin() then raise exception 'Sem permissão.'; end if;
  if p_user = auth.uid() and not p_value then
    raise exception 'Você não pode remover o próprio acesso de super admin.';
  end if;
  update public.profiles set is_super_admin = p_value, updated_at = now() where id = p_user;
  perform public.log_event(null, 'profiles.super_admin', 'alerta',
                           jsonb_build_object('usuario', p_user, 'valor', p_value), 'profiles', p_user);
end $$;

-- Admin ou titular: adiciona membro já cadastrado pelo e-mail.
create function public.add_residence_member(p_res uuid, p_email text, p_role text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_id uuid;
begin
  if p_role not in ('titular','morador') then raise exception 'Papel inválido.'; end if;
  if not public.can_manage_residence(p_res) then raise exception 'Sem permissão.'; end if;
  if p_role = 'titular' and not public.is_org_admin(public.residence_org(p_res)) then
    raise exception 'Apenas o administrador pode cadastrar titulares.';
  end if;
  select id into v_user from public.profiles where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'Nenhum usuário com este e-mail. Envie um convite para a pessoa se cadastrar.';
  end if;
  insert into public.residence_members (residence_id, user_id, role, status, approved_by, approved_at)
  values (p_res, v_user, p_role, 'ativo', auth.uid(), now())
  on conflict (residence_id, user_id) do update set role = excluded.role, status = 'ativo',
     approved_by = auth.uid(), approved_at = now()
  returning id into v_id;
  return v_id;
end $$;

-- Convites
create function public.create_invite(p_res uuid, p_role text, p_max_uses integer default 1,
                                     p_hours integer default 72, p_requires_approval boolean default true)
returns text
language plpgsql security definer set search_path = '' as $$
declare v_code text;
begin
  if p_role not in ('titular','morador') then raise exception 'Papel inválido.'; end if;
  if not public.can_manage_residence(p_res) then raise exception 'Sem permissão.'; end if;
  if p_role = 'titular' and not public.is_org_admin(public.residence_org(p_res)) then
    raise exception 'Apenas o administrador pode convidar titulares.';
  end if;
  if p_hours not between 1 and 24 * 90 then raise exception 'Validade deve ser entre 1 hora e 90 dias.'; end if;
  loop
    v_code := public.random_code(8);
    exit when not exists (select 1 from public.invites where code = v_code);
  end loop;
  insert into public.invites (residence_id, code, role, requires_approval, max_uses, expires_at, created_by)
  values (p_res, v_code, p_role, p_requires_approval, greatest(1, p_max_uses),
          now() + make_interval(hours => p_hours), auth.uid());
  return v_code;
end $$;

create function public.invite_preview(p_code text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  select jsonb_build_object('residencia', r.name, 'organizacao', o.name, 'papel', i.role,
                            'valido', (not i.revoked and i.expires_at > now() and i.uses < i.max_uses))
  into v
  from public.invites i
  join public.residences r on r.id = i.residence_id
  join public.organizations o on o.id = r.org_id
  where i.code = upper(trim(p_code));
  return v;
end $$;

create function public.redeem_invite(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_inv public.invites%rowtype;
  v_status text;
begin
  if auth.uid() is null then raise exception 'Faça login para usar o convite.'; end if;
  select * into v_inv from public.invites where code = upper(trim(p_code)) for update;
  if not found or v_inv.revoked or v_inv.expires_at <= now() or v_inv.uses >= v_inv.max_uses then
    perform public.log_event(public.residence_org(v_inv.residence_id), 'convite.invalido', 'alerta',
                             jsonb_build_object('codigo', upper(trim(p_code))));
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

-- Dispositivos: cria e devolve o segredo UMA vez.
create function public.create_device(p_org uuid, p_name text, p_driver text,
                                     p_manufacturer text default null, p_model text default null,
                                     p_serial text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_secret text;
begin
  if not public.is_org_admin(p_org) then raise exception 'Sem permissão.'; end if;
  if not exists (select 1 from public.device_drivers where id = p_driver and active) then
    raise exception 'Driver não suportado.';
  end if;
  insert into public.devices (org_id, name, driver_id, manufacturer, model, serial)
  values (p_org, p_name, p_driver, p_manufacturer, p_model, p_serial)
  returning id into v_id;
  v_secret := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.device_secrets (device_id, secret_hash)
  values (v_id, encode(extensions.digest(v_secret, 'sha256'), 'hex'));
  return jsonb_build_object('device_id', v_id, 'secret', v_secret);
end $$;

create function public.rotate_device_secret(p_device uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_secret text;
begin
  select org_id into v_org from public.devices where id = p_device;
  if v_org is null or not public.is_org_admin(v_org) then raise exception 'Sem permissão.'; end if;
  v_secret := encode(extensions.gen_random_bytes(24), 'hex');
  update public.device_secrets
     set secret_hash = encode(extensions.digest(v_secret, 'sha256'), 'hex'), rotated_at = now()
   where device_id = p_device;
  perform public.log_event(v_org, 'devices.segredo_renovado', 'alerta', '{}'::jsonb, 'devices', p_device);
  return v_secret;
end $$;

-- Núcleo do acionamento (usado pelo app e pelas chaves temporárias).
create function public.enqueue_command(p_gate uuid, p_action text, p_user uuid, p_residence uuid,
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
  select * into v_dev from public.devices where id = v_gate.device_id;
  select active into v_org_active from public.organizations where id = v_gate.org_id;

  if v_gate.id is null or not coalesce(v_gate.active and v_dev.active and v_org_active, false) then
    return jsonb_build_object('ok', false, 'erro', 'Portão ou dispositivo desativado.');
  end if;
  if p_action not in ('abrir','fechar','pulso') then
    return jsonb_build_object('ok', false, 'erro', 'Ação inválida.');
  end if;
  if v_gate.mode = 'pulso' and p_action <> 'pulso' then
    return jsonb_build_object('ok', false, 'erro', 'Este portão só aceita comando de pulso.');
  end if;

  -- Limite: 1 comando a cada 2 s por portão.
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

create function public.request_gate_command(p_gate uuid, p_action text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_res uuid;
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

  return public.enqueue_command(p_gate, p_action, auth.uid(), v_res, 'app', null);
end $$;

-- Lista de portões do usuário com status online.
create function public.my_gates() returns table (
  gate_id uuid, gate_name text, mode text, state text, state_updated_at timestamptz,
  device_id uuid, device_name text, online boolean, last_seen_at timestamptz,
  org_id uuid, org_name text, residence_id uuid, residence_name text, can_operate boolean)
language sql stable security definer set search_path = '' as $$
  select g.id, g.name, g.mode, g.state, g.state_updated_at,
         d.id, d.name, public.device_online(d.last_seen_at), d.last_seen_at,
         o.id, o.name, ar.residence_id, r.name,
         (ar.residence_id is not null or public.is_org_staff(g.org_id)) and g.active and d.active
  from public.gates g
  join public.devices d on d.id = g.device_id
  join public.organizations o on o.id = g.org_id
  left join lateral (select public.gate_access_residence(g.id, auth.uid()) as residence_id) ar on true
  left join public.residences r on r.id = ar.residence_id
  where (ar.residence_id is not null or public.is_org_staff(g.org_id))
  order by o.name, g.name;
$$;

-- Chaves temporárias
create function public.create_temp_key(p_res uuid, p_label text, p_gates uuid[],
                                       p_valid_from timestamptz, p_valid_until timestamptz,
                                       p_daily_start time default null, p_daily_end time default null,
                                       p_weekdays integer[] default null, p_max_uses integer default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_token text; v_id uuid;
begin
  if not public.can_manage_residence(p_res) then raise exception 'Sem permissão.'; end if;
  if p_gates is null or cardinality(p_gates) = 0 then raise exception 'Selecione ao menos um portão.'; end if;
  if exists (select 1 from unnest(p_gates) g
             where not exists (select 1 from public.gate_residences gr
                               where gr.gate_id = g and gr.residence_id = p_res)) then
    raise exception 'Um dos portões não pertence a esta residência.';
  end if;
  if p_valid_until <= p_valid_from then raise exception 'A data final deve ser depois da inicial.'; end if;
  if p_valid_until > now() + interval '1 year' then raise exception 'Validade máxima: 1 ano.'; end if;
  if (p_daily_start is null) <> (p_daily_end is null) then
    raise exception 'Informe o horário inicial e final.';
  end if;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.temp_keys (residence_id, label, token, gate_ids, valid_from, valid_until,
                                daily_start, daily_end, weekdays, max_uses, created_by)
  values (p_res, p_label, v_token, p_gates, p_valid_from, p_valid_until,
          p_daily_start, p_daily_end, p_weekdays, p_max_uses, auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'token', v_token);
end $$;

-- Valida a chave e devolve o motivo quando não pode ser usada agora.
create function public.temp_key_check(p_key public.temp_keys) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz text;
  v_local timestamp;
begin
  if p_key.revoked_at is not null then return 'Esta chave foi revogada.'; end if;
  if now() < p_key.valid_from then return 'Esta chave ainda não está válida.'; end if;
  if now() >= p_key.valid_until then return 'Esta chave expirou.'; end if;
  if p_key.max_uses is not null and p_key.uses >= p_key.max_uses then
    return 'Limite de usos atingido.';
  end if;
  select o.timezone into v_tz from public.residences r join public.organizations o on o.id = r.org_id
   where r.id = p_key.residence_id;
  v_local := now() at time zone v_tz;
  if p_key.weekdays is not null and not (extract(dow from v_local)::int = any (p_key.weekdays)) then
    return 'Esta chave não é válida hoje.';
  end if;
  if p_key.daily_start is not null then
    if p_key.daily_start <= p_key.daily_end then
      if not (v_local::time between p_key.daily_start and p_key.daily_end) then
        return 'Fora do horário permitido.';
      end if;
    elsif not (v_local::time >= p_key.daily_start or v_local::time <= p_key.daily_end) then
      return 'Fora do horário permitido.';
    end if;
  end if;
  return null;
end $$;

create function public.guest_key_info(p_token text) returns jsonb
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
                  'online', public.device_online(d.last_seen_at)) order by g.name)
               from public.gates g join public.devices d on d.id = g.device_id
               where g.id = any (v_key.gate_ids) and g.active), '[]'::jsonb));
end $$;

create function public.guest_request_command(p_token text, p_gate uuid, p_action text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_key public.temp_keys%rowtype;
  v_reason text;
  v_result jsonb;
  v_org uuid;
begin
  select * into v_key from public.temp_keys where token = p_token for update;
  if not found then
    perform public.log_event(null, 'chave_temporaria.invalida', 'alerta',
                             jsonb_build_object('portao', p_gate));
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

create function public.guest_command_status(p_token text, p_command uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('status', c.status, 'erro', c.error)
  from public.commands c join public.temp_keys k on k.id = c.temp_key_id
  where c.id = p_command and k.token = p_token;
$$;

-- =====================================================================
-- FUNÇÕES DO DISPOSITIVO (somente a Edge Function, com service_role)
-- =====================================================================

create function public.device_auth(p_device uuid, p_secret text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.device_secrets s join public.devices d on d.id = s.device_id
                 where s.device_id = p_device and d.active
                   and s.secret_hash = encode(extensions.digest(p_secret, 'sha256'), 'hex'));
$$;

-- Atualiza telemetria/estados e entrega comandos pendentes.
create function public.device_poll(p_device uuid, p_states jsonb, p_info jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_cmds jsonb;
begin
  update public.devices set
    last_seen_at = now(),
    firmware = coalesce(p_info->>'firmware', firmware),
    ip = coalesce(p_info->>'ip', ip),
    rssi = coalesce((p_info->>'rssi')::int, rssi)
  where id = p_device
    and (last_seen_at is null or last_seen_at < now() - interval '5 seconds'
         or firmware is distinct from coalesce(p_info->>'firmware', firmware));

  if p_states is not null and jsonb_typeof(p_states) = 'object' then
    update public.gates g set state = s.value, state_updated_at = now()
    from jsonb_each_text(p_states) s
    where g.device_id = p_device and g.channel = s.key::int
      and s.value in ('aberto','fechado','movendo','desconhecido')
      and g.state is distinct from s.value;
  end if;

  -- Comandos com mais de 10 s não são mais entregues.
  update public.commands set status = 'expirado', completed_at = now(),
         error = 'Dispositivo não recebeu o comando a tempo'
  where device_id = p_device and status = 'pendente' and created_at < now() - interval '10 seconds';

  with picked as (
    select c.id from public.commands c
    where c.device_id = p_device and c.status = 'pendente'
    order by c.created_at
    for update skip locked
  ), upd as (
    update public.commands c set status = 'enviado', sent_at = now()
    from picked where c.id = picked.id
    returning c.id, c.action, c.gate_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', u.id, 'action', u.action, 'channel', g.channel,
           'mode', g.mode, 'pulse_ms', g.pulse_ms)), '[]'::jsonb)
  into v_cmds
  from upd u join public.gates g on g.id = u.gate_id;

  return v_cmds;
end $$;

create function public.device_ack(p_device uuid, p_command uuid, p_success boolean, p_error text)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_gate uuid;
begin
  update public.commands
     set status = case when p_success then 'sucesso' else 'falha' end,
         error = case when p_success then null else left(coalesce(p_error, 'Falha no dispositivo'), 300) end,
         completed_at = now()
   where id = p_command and device_id = p_device and status in ('enviado','pendente')
  returning org_id, gate_id into v_org, v_gate;
  if not found then return false; end if;
  if not p_success then
    insert into public.audit_logs (org_id, action, entity, entity_id, severity, details)
    values (v_org, 'acionamento.falha', 'commands', p_command, 'alerta',
            jsonb_build_object('portao', v_gate, 'erro', p_error));
  end if;
  return true;
end $$;

create function public.device_auth_failed(p_device uuid, p_ip text) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_logs (org_id, action, entity, entity_id, severity, details)
  values ((select org_id from public.devices where id = p_device),
          'dispositivo.autenticacao_falhou', 'devices', p_device, 'critico',
          jsonb_build_object('ip', p_ip));
$$;

-- =====================================================================
-- PERMISSÕES DE EXECUÇÃO
-- =====================================================================

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.is_super_admin(), public.is_org_admin(uuid), public.is_org_staff(uuid),
  public.residence_org(uuid), public.is_residence_member(uuid), public.is_residence_titular(uuid),
  public.can_manage_residence(uuid), public.is_org_participant(uuid),
  public.gate_access_residence(uuid, uuid), public.can_view_gate(uuid), public.can_view_profile(uuid),
  public.device_org(uuid), public.can_view_device(uuid),
  public.device_online(timestamptz),
  public.add_org_admin(uuid, text), public.set_super_admin(uuid, boolean),
  public.add_residence_member(uuid, text, text),
  public.create_invite(uuid, text, integer, integer, boolean),
  public.invite_preview(text), public.redeem_invite(text),
  public.create_device(uuid, text, text, text, text, text), public.rotate_device_secret(uuid),
  public.request_gate_command(uuid, text), public.my_gates(),
  public.create_temp_key(uuid, text, uuid[], timestamptz, timestamptz, time, time, integer[], integer)
to authenticated;

grant execute on function
  public.guest_key_info(text), public.guest_request_command(text, uuid, text),
  public.guest_command_status(text, uuid)
to anon, authenticated;

grant execute on function
  public.device_auth(uuid, text), public.device_poll(uuid, jsonb, jsonb),
  public.device_ack(uuid, uuid, boolean, text), public.device_auth_failed(uuid, text)
to service_role;
