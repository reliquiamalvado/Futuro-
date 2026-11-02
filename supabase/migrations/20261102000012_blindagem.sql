-- Blindagem: padrões fechados para objetos futuros, RLS automático,
-- bloqueio de força bruta nos equipamentos e segredo para a função de notificações.

-- ---------------------------------------------------------------- padrões fechados
-- Tabelas, funções e sequências criadas daqui em diante NÃO ficam abertas ao público.
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon;

-- ---------------------------------------------------------------- força bruta (equipamentos)
-- IP com 20 ou mais falhas de credencial nos últimos 10 minutos fica bloqueado.
create function public.device_ip_blocked(p_ip text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(p_ip, '') <> '' and (
    select count(*) from public.audit_logs
    where action = 'dispositivo.autenticacao_falhou' and details->>'ip' = p_ip
      and created_at > now() - interval '10 minutes') >= 20;
$$;
revoke execute on function public.device_ip_blocked(text) from public, anon, authenticated;
grant execute on function public.device_ip_blocked(text) to service_role;

-- ---------------------------------------------------------------- notificações
-- Segredo gerado e guardado no cofre do banco (Vault). Só o banco o envia à função.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'notify_admin_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'notify_admin_secret',
                                'Autentica chamadas do banco para a Edge Function notify-admin');
  end if;
end $$;

create or replace function public.dispatch_admin_notification() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'notify_admin_secret');
begin
  perform net.http_post(
    url := 'https://miqjabshccauhvzcqzle.supabase.co/functions/v1/notify-admin',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret),
    body := jsonb_build_object('id', new.id)
  );
  return null;
end $$;

-- A função confere o segredo sem nunca recebê-lo em variável de ambiente.
create function public.notify_secret_ok(p_secret text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(p_secret, '') <> ''
     and p_secret = (select decrypted_secret from vault.decrypted_secrets where name = 'notify_admin_secret');
$$;
revoke execute on function public.notify_secret_ok(text) from public, anon, authenticated;
grant execute on function public.notify_secret_ok(text) to service_role;
