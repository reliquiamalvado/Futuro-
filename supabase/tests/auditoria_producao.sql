-- =====================================================================
-- AUDITORIA DE SEGURANÇA DO BANCO EM PRODUÇÃO (somente leitura)
-- Rode no Supabase: SQL Editor → cole tudo → Run.
-- Tudo acontece numa transação desfeita no final (ROLLBACK): nada é gravado.
-- Resultado esperado: todas as linhas com "OK" ou "BLOQUEADO".
-- =====================================================================
begin;

create function pg_temp.tenta(p_sql text) returns text language plpgsql as $f$
declare n bigint;
begin
  begin
    execute 'select count(*) from (' || p_sql || ') x' into n;
    return case when n = 0 then 'BLOQUEADO (0 linhas)' else 'FALHA: leu ' || n || ' linha(s)' end;
  exception when others then return 'BLOQUEADO (' || left(sqlerrm, 60) || ')';
  end;
end $f$;
create function pg_temp.executa(p_sql text) returns text language plpgsql as $f$
declare r text;
begin
  begin
    execute p_sql into r;
    return 'EXECUTOU → ' || coalesce(left(r, 80), 'null');
  exception when others then return 'BLOQUEADO (' || left(sqlerrm, 70) || ')';
  end;
end $f$;
grant execute on function pg_temp.tenta(text), pg_temp.executa(text) to anon, authenticated;

create temp table resultado (grupo text, teste text, resultado text);
grant insert, select on resultado to anon, authenticated;

-- ---------- 1. Catálogo ----------
insert into resultado
select 'catálogo', 'tabelas sem RLS',
       coalesce('FALHA: ' || string_agg(c.relname, ', '), 'OK')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
union all
select 'catálogo', 'tabelas acessíveis ao anônimo',
       coalesce('FALHA: ' || string_agg(distinct table_name, ', '), 'OK')
  from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon'
union all
select 'catálogo', 'funções públicas além das de chave temporária',
       coalesce('FALHA: ' || string_agg(p.proname, ', '), 'OK')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
   and p.proname not in ('guest_key_info','guest_request_command','guest_command_status')
union all
select 'catálogo', 'funções privilegiadas sem search_path',
       coalesce('FALHA: ' || string_agg(p.proname, ', '), 'OK')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prosecdef
   and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
union all
select 'catálogo', 'funções internas chamáveis pelo app',
       coalesce('FALHA: ' || string_agg(p.proname, ', '), 'OK')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('device_auth','device_poll','device_ack','device_set_states','device_auth_failed',
                     'device_ip_blocked','notify_secret_ok','enqueue_command','log_event','temp_key_check')
   and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))
union all
select 'catálogo', 'tabelas no tempo real (realtime)',
       coalesce('ATENÇÃO: ' || string_agg(tablename, ', '), 'OK')
  from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'
union all
select 'catálogo', 'segredo de notificação no Vault',
       case when exists (select 1 from vault.secrets where name = 'notify_admin_secret') then 'OK' else 'FALHA: ausente' end;

-- ---------- 2. Ataques como visitante anônimo ----------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
insert into resultado values
 ('anônimo', 'ler perfis',                 pg_temp.tenta('select * from public.profiles')),
 ('anônimo', 'ler clientes',               pg_temp.tenta('select * from public.organizations')),
 ('anônimo', 'ler segredos de equipamento',pg_temp.tenta('select * from public.device_secrets')),
 ('anônimo', 'ler chaves temporárias',     pg_temp.tenta('select * from public.temp_keys')),
 ('anônimo', 'ler auditoria',              pg_temp.tenta('select * from public.audit_logs')),
 ('anônimo', 'ler usuários do Auth',       pg_temp.tenta('select * from auth.users')),
 ('anônimo', 'ler cofre (Vault)',          pg_temp.tenta('select * from vault.decrypted_secrets')),
 ('anônimo', 'criar cliente',              pg_temp.executa($$insert into public.organizations(name) values ('x') returning id::text$$)),
 ('anônimo', 'virar super admin',          pg_temp.executa($$select public.set_super_admin(gen_random_uuid(), true)::text$$)),
 ('anônimo', 'abrir portão',               pg_temp.executa($$select public.request_gate_command(gen_random_uuid(), 'pulso')::text$$)),
 ('anônimo', 'fingir ser equipamento',     pg_temp.executa($$select public.device_poll(gen_random_uuid(), null, null)::text$$));
reset role;

-- ---------- 3. Ataques como usuário logado sem permissão ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7b1f0c5e-0000-4000-8000-00000000abcd","role":"authenticated","aal":"aal1"}', true);
insert into resultado values
 ('logado', 'ler perfis de outros',        pg_temp.tenta('select * from public.profiles')),
 ('logado', 'ler clientes',                pg_temp.tenta('select * from public.organizations')),
 ('logado', 'ler moradores',               pg_temp.tenta('select * from public.residence_members')),
 ('logado', 'ler equipamentos',            pg_temp.tenta('select * from public.devices')),
 ('logado', 'ler segredos de equipamento', pg_temp.tenta('select * from public.device_secrets')),
 ('logado', 'ler portões',                 pg_temp.tenta('select * from public.gates')),
 ('logado', 'ler chaves temporárias',      pg_temp.tenta('select * from public.temp_keys')),
 ('logado', 'ler acionamentos',            pg_temp.tenta('select * from public.commands')),
 ('logado', 'ler auditoria',               pg_temp.tenta('select * from public.audit_logs')),
 ('logado', 'ler pedidos de clientes',     pg_temp.tenta('select * from public.org_requests')),
 ('logado', 'ler notificações',            pg_temp.tenta('select * from public.admin_notifications')),
 ('logado', 'ler fatores 2FA',             pg_temp.tenta('select * from auth.mfa_factors')),
 ('logado', 'ler cofre (Vault)',           pg_temp.tenta('select * from vault.decrypted_secrets')),
 ('logado', 'criar cliente',               pg_temp.executa($$insert into public.organizations(name) values ('x') returning id::text$$)),
 ('logado', 'virar super admin (update)',  pg_temp.executa($$update public.profiles set is_super_admin = true where id = auth.uid() returning id::text$$)),
 ('logado', 'virar super admin (função)',  pg_temp.executa($$select public.set_super_admin(auth.uid(), true)::text$$)),
 ('logado', 'entrar em residência direto', pg_temp.executa($$insert into public.residence_members(residence_id, user_id, role, status) values (gen_random_uuid(), auth.uid(), 'titular', 'ativo') returning id::text$$)),
 ('logado', 'criar equipamento alheio',    pg_temp.executa($$select public.create_device(gen_random_uuid(), 'x', 'dc-esp32-https')::text$$)),
 ('logado', 'aprovar pedido de cliente',   pg_temp.executa($$select public.review_org_request(gen_random_uuid(), true)::text$$)),
 ('logado', 'apagar auditoria',            pg_temp.executa($$delete from public.audit_logs returning id::text$$)),
 ('logado', 'fingir ser equipamento',      pg_temp.executa($$select public.device_poll(gen_random_uuid(), null, null)::text$$));
reset role;

select grupo, teste, resultado,
       case when resultado like 'OK%' or resultado like 'BLOQUEADO%' then '✅' else '❌' end as status
  from resultado order by grupo, teste;

rollback;
