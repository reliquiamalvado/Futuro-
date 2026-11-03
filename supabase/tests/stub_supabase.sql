-- Simula o ambiente mínimo do Supabase para testar as migrações em um Postgres local.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  end if;
end $$;
create schema auth; create schema extensions;
create extension pgcrypto with schema extensions;
create table auth.users (id uuid primary key default gen_random_uuid(), email text,
  raw_user_meta_data jsonb default '{}'::jsonb, raw_app_meta_data jsonb default '{}'::jsonb, last_sign_in_at timestamptz);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema public, auth, extensions to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

-- pg_net (simulado): registra as chamadas HTTP em vez de enviá-las.
create schema if not exists net;
create table if not exists net.chamadas (url text, body jsonb, criado timestamptz default now());
create or replace function net.http_post(url text, headers jsonb default '{}', body jsonb default '{}')
returns bigint language sql as $$ insert into net.chamadas (url, body) values (url, body); select 1::bigint $$;

-- 2FA (simulado): fatores e o nível da sessão (aal) vindo do JWT.
create table if not exists auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid, status text);
create or replace function auth.jwt() returns jsonb language sql stable as
  $$ select jsonb_build_object('aal', coalesce(nullif(current_setting('request.jwt.claim.aal', true), ''), 'aal1')) $$;
grant execute on function auth.jwt() to anon, authenticated, service_role;

-- Vault (simulado).
create schema if not exists vault;
create table if not exists vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, secret text, description text);
create or replace view vault.decrypted_secrets as select id, name, secret as decrypted_secret from vault.secrets;
create or replace function vault.create_secret(p_secret text, p_name text, p_desc text default null) returns uuid
language sql as $$ insert into vault.secrets (name, secret, description) values (p_name, p_secret, p_desc) returning id $$;

-- Sessões de login (simulado) e session_id no JWT.
create table if not exists auth.sessions (id uuid primary key, user_id uuid, created_at timestamptz default now());
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select jsonb_build_object(
    'aal', coalesce(nullif(current_setting('request.jwt.claim.aal', true), ''), 'aal1'),
    'session_id', nullif(current_setting('request.jwt.claim.session_id', true), ''))
$$;
