-- Perfil escolhido no cadastro e pedidos de cadastro de condomínios/empresas.

alter table public.profiles
  add column account_type text check (account_type in ('casa','morador','sindico','empresa'));
grant update (account_type) on public.profiles to authenticated;

-- Perfil vem do formulário de cadastro (metadados) quando informado.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_first boolean;
  v_type text := new.raw_user_meta_data->>'account_type';
begin
  select not exists (select 1 from public.profiles where is_super_admin) into v_first;
  insert into public.profiles (id, full_name, email, is_super_admin, account_type)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
          new.email,
          v_first,
          case when v_type in ('casa','morador','sindico','empresa') then v_type end);
  return new;
end $$;

-- Aviso de cadastro passa a dizer o perfil escolhido.
create or replace function public.notify_new_signup() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_provider text;
  v_total bigint;
begin
  select coalesce(u.raw_app_meta_data->>'provider', 'email') into v_provider
    from auth.users u where u.id = new.id;
  select count(*) into v_total from public.profiles;

  insert into public.admin_notifications (kind, message, payload)
  values ('novo_cadastro',
          '🔔 AuggeControl: novo cadastro' || chr(10) ||
          'Nome: ' || coalesce(nullif(new.full_name, ''), '(não informado)') || chr(10) ||
          'E-mail: ' || coalesce(new.email, '—') || chr(10) ||
          'Perfil: ' || case new.account_type
                          when 'casa' then 'Dono de casa'
                          when 'morador' then 'Morador de condomínio'
                          when 'sindico' then 'Síndico / Administradora'
                          when 'empresa' then 'Empresa'
                          else 'ainda não escolhido' end || chr(10) ||
          'Entrou com: ' || case v_provider when 'google' then 'Google' else 'E-mail e senha' end || chr(10) ||
          'Total de usuários: ' || v_total,
          jsonb_build_object('user_id', new.id, 'email', new.email, 'provider', v_provider,
                             'account_type', new.account_type));
  return null;
end $$;

-- ---------------------------------------------------------------- pedidos
create table public.org_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  kind         text not null check (kind in ('condominio','empresa')),
  org_name     text not null check (length(trim(org_name)) between 2 and 120),
  group_label  text not null default 'Bloco' check (group_label in ('Bloco','Rua','Quadra','Torre')),
  city         text check (city is null or length(city) <= 80),
  phone        text check (phone is null or length(phone) <= 30),
  units        integer check (units is null or units between 1 and 100000),
  notes        text check (notes is null or length(notes) <= 1000),
  status       text not null default 'pendente' check (status in ('pendente','aprovada','recusada')),
  answer       text check (answer is null or length(answer) <= 500),
  org_id       uuid references public.organizations(id) on delete set null,
  reviewed_by  uuid references public.profiles(id) on delete set null,
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index on public.org_requests (status, created_at);
create index on public.org_requests (user_id);
create index on public.org_requests (org_id);
create index on public.org_requests (reviewed_by);

alter table public.org_requests enable row level security;
revoke all on public.org_requests from anon;

create policy orq_select on public.org_requests for select to authenticated
  using (user_id = (select auth.uid()) or public.is_super_admin());
create policy orq_insert on public.org_requests for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pendente');
revoke update, delete on public.org_requests from authenticated;
revoke insert on public.org_requests from authenticated;
grant insert (user_id, kind, org_name, group_label, city, phone, units, notes) on public.org_requests to authenticated;

-- No máximo um pedido pendente por pessoa.
create unique index org_requests_one_pending on public.org_requests (user_id) where status = 'pendente';

-- Novo pedido -> aviso para o dono da plataforma.
create function public.notify_org_request() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.admin_notifications (kind, message, payload)
  values ('pedido_cliente',
          '🏢 AuggeControl: novo pedido de cadastro' || chr(10) ||
          'Tipo: ' || case new.kind when 'condominio' then 'Condomínio' else 'Empresa' end || chr(10) ||
          'Nome: ' || new.org_name || chr(10) ||
          'Cidade: ' || coalesce(new.city, '—') || chr(10) ||
          'Unidades: ' || coalesce(new.units::text, '—') || chr(10) ||
          'Contato: ' || coalesce((select email from public.profiles where id = new.user_id), '—') ||
          coalesce(' · ' || new.phone, ''),
          jsonb_build_object('request_id', new.id));
  return null;
end $$;
create trigger notify_org_request after insert on public.org_requests
for each row execute function public.notify_org_request();

-- Super admin aprova (cria o cliente e torna o solicitante administrador) ou recusa.
create function public.review_org_request(p_id uuid, p_approve boolean, p_answer text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_req public.org_requests%rowtype;
  v_org uuid;
begin
  if not public.is_super_admin() then raise exception 'Sem permissão.'; end if;
  select * into v_req from public.org_requests where id = p_id for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if v_req.status <> 'pendente' then raise exception 'Este pedido já foi analisado.'; end if;

  if p_approve then
    insert into public.organizations (name, kind, group_label, phone, address, created_by)
    values (v_req.org_name, v_req.kind, v_req.group_label, v_req.phone, v_req.city, auth.uid())
    returning id into v_org;
    insert into public.org_admins (org_id, user_id) values (v_org, v_req.user_id);
  end if;

  update public.org_requests
     set status = case when p_approve then 'aprovada' else 'recusada' end,
         answer = nullif(trim(coalesce(p_answer, '')), ''),
         org_id = v_org, reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_id;
  return v_org;
end $$;

revoke execute on function public.notify_org_request() from public, anon, authenticated;
revoke execute on function public.review_org_request(uuid, boolean, text) from public, anon;
grant execute on function public.review_org_request(uuid, boolean, text) to authenticated;
