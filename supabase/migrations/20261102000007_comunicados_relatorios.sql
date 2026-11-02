-- Comunicados, relatórios e vínculo do convite usado em cada cadastro.

-- ---------------------------------------------------------------- convite usado
alter table public.residence_members
  add constraint residence_members_invite_id_fkey
  foreign key (invite_id) references public.invites(id) on delete set null;
create index if not exists residence_members_invite_id_idx on public.residence_members (invite_id);

-- ---------------------------------------------------------------- comunicados
create function public.is_org_member(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.residence_members m
                 join public.residences r on r.id = m.residence_id
                 where r.org_id = p_org and m.user_id = auth.uid() and m.status = 'ativo');
$$;

create table public.announcements (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  residence_id  uuid references public.residences(id) on delete cascade,   -- null = todos da organização
  title         text not null check (length(trim(title)) between 3 and 120),
  body          text not null check (length(trim(body)) between 1 and 5000),
  important     boolean not null default false,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index on public.announcements (org_id, created_at desc);
create index on public.announcements (residence_id);
create index on public.announcements (created_by);

create table public.announcement_reads (
  announcement_id  uuid not null references public.announcements(id) on delete cascade,
  user_id          uuid not null references public.profiles(id) on delete cascade,
  read_at          timestamptz not null default now(),
  primary key (announcement_id, user_id)
);
create index on public.announcement_reads (user_id);

alter table public.announcements enable row level security;
alter table public.announcement_reads enable row level security;
revoke all on public.announcements, public.announcement_reads from anon;

create function public.can_view_announcement(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.announcements a
    where a.id = p_id
      and (public.is_org_admin(a.org_id)
           or (a.residence_id is null and public.is_org_member(a.org_id))
           or (a.residence_id is not null and public.is_residence_member(a.residence_id))));
$$;

create policy ann_select on public.announcements for select to authenticated
  using (public.is_org_admin(org_id)
         or (residence_id is null and public.is_org_member(org_id))
         or (residence_id is not null and public.is_residence_member(residence_id)));
create policy ann_insert on public.announcements for insert to authenticated
  with check (public.is_org_admin(org_id)
              and created_by = (select auth.uid())
              and (residence_id is null or public.residence_org(residence_id) = org_id));
create policy ann_delete on public.announcements for delete to authenticated
  using (public.is_org_admin(org_id));
revoke update on public.announcements from authenticated;

create policy ar_select on public.announcement_reads for select to authenticated
  using (user_id = (select auth.uid())
         or exists (select 1 from public.announcements a
                    where a.id = announcement_id and public.is_org_admin(a.org_id)));
create policy ar_insert on public.announcement_reads for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_view_announcement(announcement_id));
revoke update, delete on public.announcement_reads from authenticated;

-- Auditoria passa a cobrir comunicados.
create or replace function public.audit_change() returns trigger
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
    return null;
  end if;

  v_id := nullif(v_row->>'id','')::uuid;
  v_org := case tg_table_name
    when 'organizations'     then (v_row->>'id')::uuid
    when 'org_admins'        then (v_row->>'org_id')::uuid
    when 'residences'        then (v_row->>'org_id')::uuid
    when 'devices'           then (v_row->>'org_id')::uuid
    when 'gates'             then (v_row->>'org_id')::uuid
    when 'announcements'     then (v_row->>'org_id')::uuid
    when 'residence_members' then public.residence_org((v_row->>'residence_id')::uuid)
    when 'invites'           then public.residence_org((v_row->>'residence_id')::uuid)
    when 'temp_keys'         then public.residence_org((v_row->>'residence_id')::uuid)
    when 'gate_residences'   then public.residence_org((v_row->>'residence_id')::uuid)
  end;

  if v_org is not null and not exists (select 1 from public.organizations where id = v_org) then
    v_org := null;
  end if;

  insert into public.audit_logs (org_id, actor_id, action, entity, entity_id, details)
  values (v_org, auth.uid(), tg_table_name || '.' || lower(tg_op), tg_table_name, v_id,
          jsonb_strip_nulls(jsonb_build_object('antes', v_old - v_ignore, 'depois', v_new - v_ignore)));
  return null;
end $$;

create trigger audit_announcements after insert or update or delete on public.announcements
for each row execute function public.audit_change();

-- ---------------------------------------------------------------- relatórios
-- Roda com as permissões de quem chama (RLS): cada um só vê o próprio escopo.
create function public.report_stats(p_org uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_tz text := coalesce((select timezone from public.organizations where id = p_org), 'America/Sao_Paulo');
  v jsonb;
begin
  if p_to <= p_from or p_to - p_from > interval '366 days' then
    raise exception 'Período inválido (máximo de 1 ano).';
  end if;

  with
  cmd as (
    select c.* from public.commands c
    where c.created_at >= p_from and c.created_at < p_to and (p_org is null or c.org_id = p_org)
  ),
  mem as (
    select m.* from public.residence_members m join public.residences r on r.id = m.residence_id
    where p_org is null or r.org_id = p_org
  ),
  dias as (
    select d::date as dia
    from generate_series((p_from at time zone v_tz)::date, ((p_to - interval '1 second') at time zone v_tz)::date,
                         interval '1 day') d
  )
  select jsonb_build_object(
    'moradores', jsonb_build_object(
       'ativos',     (select count(*) from mem where status = 'ativo'),
       'pendentes',  (select count(*) from mem where status = 'pendente'),
       'bloqueados', (select count(*) from mem where status = 'bloqueado'),
       'novos',      (select count(*) from mem where created_at >= p_from and created_at < p_to)),
    'residencias', (select count(*) from public.residences where p_org is null or org_id = p_org),
    'dispositivos', jsonb_build_object(
       'total',  (select count(*) from public.devices where p_org is null or org_id = p_org),
       'online', (select count(*) from public.devices
                  where (p_org is null or org_id = p_org) and public.device_online(last_seen_at))),
    'acionamentos', jsonb_build_object(
       'total',    (select count(*) from cmd),
       'sucesso',  (select count(*) from cmd where status = 'sucesso'),
       'falha',    (select count(*) from cmd where status in ('falha','expirado')),
       'chave',    (select count(*) from cmd where source = 'chave_temporaria')),
    'por_dia', (select coalesce(jsonb_agg(jsonb_build_object(
                  'dia', d.dia,
                  'sucesso', (select count(*) from cmd where (cmd.created_at at time zone v_tz)::date = d.dia and cmd.status = 'sucesso'),
                  'falha',   (select count(*) from cmd where (cmd.created_at at time zone v_tz)::date = d.dia and cmd.status in ('falha','expirado'))
                ) order by d.dia), '[]'::jsonb) from dias d),
    'por_portao', (select coalesce(jsonb_agg(x order by x->>'total' desc), '[]'::jsonb) from (
                  select jsonb_build_object('nome', g.name, 'total', count(*),
                           'falha', count(*) filter (where cmd.status in ('falha','expirado'))) x
                  from cmd join public.gates g on g.id = cmd.gate_id
                  group by g.id, g.name order by count(*) desc limit 10) t),
    'por_usuario', (select coalesce(jsonb_agg(x order by (x->>'total')::int desc), '[]'::jsonb) from (
                  select jsonb_build_object('nome', coalesce(p.full_name, p.email, 'Usuário'), 'total', count(*)) x
                  from cmd join public.profiles p on p.id = cmd.requested_by
                  group by p.id, p.full_name, p.email order by count(*) desc limit 10) t)
  ) into v;
  return v;
end $$;

revoke execute on function public.report_stats(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.report_stats(uuid, timestamptz, timestamptz) to authenticated;
revoke execute on function public.is_org_member(uuid), public.can_view_announcement(uuid) from public, anon;
grant execute on function public.is_org_member(uuid), public.can_view_announcement(uuid) to authenticated;
