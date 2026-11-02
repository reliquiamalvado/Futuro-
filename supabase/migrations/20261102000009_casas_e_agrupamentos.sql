-- Estrutura para residência comum (casa) e condomínio (agrupamentos).

-- ---------------------------------------------------------------- agrupamentos
alter table public.organizations
  add column group_label text not null default 'Bloco'
  check (group_label in ('Bloco','Rua','Quadra','Torre'));

alter table public.residences
  add column block text check (block is null or length(trim(block)) between 1 and 60);
create index on public.residences (org_id, block);

alter table public.announcements
  add column block text check (block is null or length(trim(block)) between 1 and 60);

create function public.is_block_member(p_org uuid, p_block text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.residence_members m
                 join public.residences r on r.id = m.residence_id
                 where r.org_id = p_org and r.block = p_block
                   and m.user_id = auth.uid() and m.status = 'ativo');
$$;

-- Comunicado: todos (sem unidade e sem bloco), um bloco inteiro, ou uma unidade.
alter policy ann_select on public.announcements
  using (public.is_org_admin(org_id)
         or (residence_id is null and block is null and public.is_org_member(org_id))
         or (residence_id is null and block is not null and public.is_block_member(org_id, block))
         or (residence_id is not null and public.is_residence_member(residence_id)));

alter policy ann_insert on public.announcements
  with check (public.is_org_admin(org_id)
              and created_by = (select auth.uid())
              and (residence_id is null or public.residence_org(residence_id) = org_id)
              and (residence_id is null or block is null));

create or replace function public.can_view_announcement(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.announcements a
    where a.id = p_id
      and (public.is_org_admin(a.org_id)
           or (a.residence_id is null and a.block is null and public.is_org_member(a.org_id))
           or (a.residence_id is null and a.block is not null and public.is_block_member(a.org_id, a.block))
           or (a.residence_id is not null and public.is_residence_member(a.residence_id))));
$$;

-- ---------------------------------------------------------------- casas
-- Cria uma residência comum: organização "residencial" + a casa.
-- Usuário comum: vira administrador e titular da própria casa (até 3 casas).
-- Super admin: pode criar para um cliente pelo e-mail, ou sem dono (convida depois).
create function public.create_home(p_name text, p_address text default null, p_owner_email text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
  v_org uuid;
  v_res uuid;
begin
  if auth.uid() is null then raise exception 'Faça login para continuar.'; end if;
  if p_name is null or length(trim(p_name)) < 2 then raise exception 'Informe o nome da casa.'; end if;

  if p_owner_email is not null and trim(p_owner_email) <> '' then
    if not public.is_super_admin() then raise exception 'Sem permissão.'; end if;
    select id into v_owner from public.profiles where lower(email) = lower(trim(p_owner_email));
    if v_owner is null then
      raise exception 'Nenhum usuário com este e-mail. Crie a casa sem dono e envie um convite de titular.';
    end if;
  elsif not public.is_super_admin() then
    v_owner := auth.uid();
    if (select count(*) from public.organizations
        where created_by = auth.uid() and kind = 'residencial') >= 3 then
      raise exception 'Limite de 3 casas por conta. Fale com o suporte para cadastrar mais.';
    end if;
  end if;

  insert into public.organizations (name, kind, address, created_by)
  values (trim(p_name), 'residencial', nullif(trim(coalesce(p_address, '')), ''), auth.uid())
  returning id into v_org;

  insert into public.residences (org_id, name, address)
  values (v_org, trim(p_name), nullif(trim(coalesce(p_address, '')), ''))
  returning id into v_res;

  if v_owner is not null then
    insert into public.org_admins (org_id, user_id) values (v_org, v_owner);
    insert into public.residence_members (residence_id, user_id, role, status, approved_by, approved_at)
    values (v_res, v_owner, 'titular', 'ativo', auth.uid(), now());
  end if;

  return jsonb_build_object('org_id', v_org, 'residence_id', v_res);
end $$;

-- Numa casa, todo portão cadastrado já fica liberado para a residência.
create function public.link_gate_home() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select kind from public.organizations where id = new.org_id) = 'residencial' then
    insert into public.gate_residences (gate_id, residence_id)
    select new.id, r.id from public.residences r where r.org_id = new.org_id
    on conflict do nothing;
  end if;
  return null;
end $$;

create trigger link_gate_home after insert on public.gates
for each row execute function public.link_gate_home();

revoke execute on function public.link_gate_home() from public, anon, authenticated;
revoke execute on function public.is_block_member(uuid, text), public.create_home(text, text, text) from public, anon;
grant execute on function public.is_block_member(uuid, text), public.create_home(text, text, text) to authenticated;
