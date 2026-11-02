-- Teste de permissões (RLS) e fluxo de acionamento.
-- Rodar num banco local com stub_supabase.sql + migrações aplicadas:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/permissoes.sql
\set QUIET on
\set ON_ERROR_STOP on

create or replace function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$
begin
  if c is distinct from true then raise exception 'FALHOU: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;

-- Executa SQL e retorna a mensagem de erro (ou null se deu certo).
create or replace function pg_temp.erro(sql text) returns text language plpgsql as $$
begin
  execute sql; return null;
exception when others then return sqlerrm;
end $$;

-- Usuários (o primeiro vira super admin)
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'super@t.com', '{"full_name":"Super"}'),
  ('00000000-0000-0000-0000-00000000000b', 'admin@t.com', '{"full_name":"Admin A"}'),
  ('00000000-0000-0000-0000-00000000000c', 'titular@t.com', '{"full_name":"Titular"}'),
  ('00000000-0000-0000-0000-00000000000d', 'morador@t.com', '{"full_name":"Morador"}'),
  ('00000000-0000-0000-0000-00000000000e', 'estranho@t.com', '{"full_name":"Estranho"}'),
  ('00000000-0000-0000-0000-00000000000f', 'adminb@t.com', '{"full_name":"Admin B"}');

select pg_temp.ok((select count(*) = 1 from profiles where is_super_admin), 'só o primeiro usuário é super admin');

\set SUPER '00000000-0000-0000-0000-00000000000a'
\set ADMIN '00000000-0000-0000-0000-00000000000b'
\set TIT   '00000000-0000-0000-0000-00000000000c'
\set MOR   '00000000-0000-0000-0000-00000000000d'
\set EST   '00000000-0000-0000-0000-00000000000e'
\set ADMB  '00000000-0000-0000-0000-00000000000f'

-- ---------- SUPER ADMIN ----------
set role authenticated;
select set_config('request.jwt.claim.sub', :'SUPER', false);
insert into organizations (name, kind) values ('Condomínio A', 'condominio') returning id as org_a \gset
insert into organizations (name, kind) values ('Empresa B', 'empresa') returning id as org_b \gset
select add_org_admin(:'org_a', 'admin@t.com');
select add_org_admin(:'org_b', 'adminb@t.com');

-- ---------- ESTRANHO não cria organização ----------
select set_config('request.jwt.claim.sub', :'EST', false);
select pg_temp.ok(pg_temp.erro($$insert into organizations (name) values ('Hack')$$) is not null,
                  'usuário comum não cria organização');
select pg_temp.ok(pg_temp.erro($$update profiles set is_super_admin = true where id = auth.uid()$$) is not null,
                  'usuário não se promove a super admin');

-- ---------- ADMIN A ----------
select set_config('request.jwt.claim.sub', :'ADMIN', false);
insert into residences (org_id, name) values (:'org_a', 'Casa 12') returning id as res1 \gset
select (r->>'device_id') as dev1, (r->>'secret') as secret1
  from (select create_device(:'org_a', 'ESP32 entrada', 'dc-esp32-https') r) x \gset
insert into gates (org_id, device_id, name, channel, mode) values (:'org_a', :'dev1', 'Portão social', 1, 'pulso')
  returning id as gate1 \gset
insert into gate_residences values (:'gate1', :'res1');
select pg_temp.ok(pg_temp.erro($$select * from device_secrets$$) is not null, 'admin não lê segredos dos dispositivos');
select pg_temp.ok(pg_temp.erro(format($$update organizations set active = false where id = %L$$, :'org_a')) is not null,
                  'admin não desativa a própria organização (só super admin)');
select create_invite(:'res1', 'titular', 1, 24, false) as conv_tit \gset

-- ---------- ADMIN B não vê nada do cliente A ----------
select set_config('request.jwt.claim.sub', :'ADMB', false);
select pg_temp.ok((select count(*) = 1 from organizations), 'admin B só vê a própria organização');
select pg_temp.ok((select count(*) = 0 from residences), 'admin B não vê residências do cliente A');
select pg_temp.ok((select count(*) = 0 from gates), 'admin B não vê portões do cliente A');
select pg_temp.ok((select count(*) = 0 from audit_logs where org_id = :'org_a'), 'admin B não vê auditoria do cliente A');
select pg_temp.ok(pg_temp.erro(format($$insert into gates (org_id, device_id, name) values (%L, %L, 'x')$$, :'org_b', :'dev1')) is not null,
                  'admin B não usa dispositivo do cliente A');

-- ---------- TITULAR ----------
select set_config('request.jwt.claim.sub', :'TIT', false);
select pg_temp.ok((select (redeem_invite(:'conv_tit'))->>'status' = 'ativo'), 'titular entra pelo convite');
select pg_temp.ok((select (redeem_invite(:'conv_tit'))->>'ok' = 'false'), 'convite de uso único não é reaproveitado');
select pg_temp.ok(pg_temp.erro(format($$select create_invite(%L, 'titular')$$, :'res1')) is not null,
                  'titular não convida outro titular');
select create_invite(:'res1', 'morador', 5, 48, true) as conv_mor \gset

-- ---------- MORADOR (pendente) ----------
select set_config('request.jwt.claim.sub', :'MOR', false);
select pg_temp.ok((select (redeem_invite(:'conv_mor'))->>'status' = 'pendente'), 'morador entra como pendente');
select pg_temp.ok((select (request_gate_command(:'gate1', 'pulso'))->>'ok' = 'false'), 'pendente não aciona portão');
select pg_temp.ok((select count(*) = 0 from my_gates()), 'pendente não vê portões');
select pg_temp.erro(format($$update residence_members set status = 'ativo' where user_id = %L$$, :'MOR'));
reset role;
select pg_temp.ok((select status = 'pendente' from residence_members where user_id = :'MOR'), 'morador não aprova a si mesmo');
set role authenticated;

-- ---------- TITULAR aprova ----------
select set_config('request.jwt.claim.sub', :'TIT', false);
update residence_members set status = 'ativo' where user_id = :'MOR';
select pg_temp.ok(pg_temp.erro(format($$update residence_members set role = 'titular' where user_id = %L$$, :'MOR')) is not null,
                  'titular não promove morador a titular');

-- ---------- MORADOR ativo ----------
select set_config('request.jwt.claim.sub', :'MOR', false);
select pg_temp.ok((select count(*) = 1 from residence_members), 'morador só vê o próprio vínculo');
select pg_temp.ok((select count(*) = 1 from my_gates() where can_operate), 'morador ativo vê o portão');
select pg_temp.ok((select (request_gate_command(:'gate1', 'pulso'))->>'erro' = 'Dispositivo offline.'),
                  'dispositivo offline é informado');
select pg_temp.ok((select (request_gate_command(:'gate1', 'abrir'))->>'ok' = 'false'),
                  'portão de pulso recusa abrir/fechar');
select pg_temp.ok(pg_temp.erro($$select create_invite((select residence_id from residence_members limit 1), 'morador')$$) is not null,
                  'morador não cria convites');

-- ---------- ESTRANHO ----------
select set_config('request.jwt.claim.sub', :'EST', false);
select pg_temp.ok((select (request_gate_command(:'gate1', 'pulso'))->>'ok' = 'false'), 'estranho não aciona portão');
select pg_temp.ok((select count(*) = 0 from gates), 'estranho não vê portões');
select pg_temp.ok((select count(*) = 0 from profiles where id <> auth.uid()), 'estranho não vê perfis de outros');

-- ---------- DISPOSITIVO (Edge Function / service_role) ----------
reset role;
set role service_role;
select pg_temp.ok(device_auth(:'dev1', :'secret1'), 'dispositivo autentica com o segredo certo');
select pg_temp.ok(not device_auth(:'dev1', 'errado'), 'segredo errado é recusado');
select pg_temp.ok((select jsonb_array_length(device_poll(:'dev1', '{"1":"fechado"}', '{"firmware":"1.0.0"}')) = 0),
                  'dispositivo fica online, sem comandos');

set role authenticated;
select set_config('request.jwt.claim.sub', :'MOR', false);
select (request_gate_command(:'gate1', 'pulso'))->>'command_id' as cmd1 \gset
select pg_temp.ok(:'cmd1' <> '', 'morador aciona portão online');
select pg_temp.ok((select (request_gate_command(:'gate1', 'pulso'))->>'ok' = 'false'), 'limite de 2 s entre comandos');

reset role;
set role service_role;
select pg_temp.ok((select (device_poll(:'dev1', '{"1":"movendo"}', '{}'))->0->>'id' = :'cmd1'), 'dispositivo recebe o comando');
select pg_temp.ok((select jsonb_array_length(device_poll(:'dev1', null, '{}')) = 0), 'comando não é entregue duas vezes');
select pg_temp.ok(device_ack(:'dev1', :'cmd1', true, null), 'dispositivo confirma execução');

set role authenticated;
select set_config('request.jwt.claim.sub', :'MOR', false);
select pg_temp.ok((select status = 'sucesso' from commands where id = :'cmd1'), 'morador vê o comando concluído');
select pg_temp.ok((select state = 'movendo' from gates where id = :'gate1'), 'estado do portão atualizado');

-- ---------- CHAVE TEMPORÁRIA ----------
select set_config('request.jwt.claim.sub', :'TIT', false);
select pg_temp.ok((select count(*) = 2 from commands), 'titular vê o histórico da residência (2 comandos)');
select (create_temp_key(:'res1', 'Entregador', array[:'gate1']::uuid[], now() - interval '1 minute',
        now() + interval '1 day', null, null, null, 1))->>'token' as tk \gset

reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.ok(pg_temp.erro('select * from gates') is not null, 'anônimo não lê tabelas');
select pg_temp.ok((select (guest_key_info(:'tk'))->>'label' = 'Entregador'), 'visitante abre a chave');
select pg_temp.ok((guest_key_info('chave-falsa')) is null, 'chave falsa não revela nada');
reset role;
update commands set created_at = now() - interval '1 minute';  -- libera o limite de 2 s
set role anon;
select (guest_request_command(:'tk', :'gate1', 'pulso'))->>'command_id' as cmd2 \gset
select pg_temp.ok(:'cmd2' <> '', 'visitante aciona com chave válida');
select pg_temp.ok((select (guest_command_status(:'tk', :'cmd2'))->>'status' = 'pendente'), 'visitante acompanha o comando');
reset role;
update commands set created_at = now() - interval '1 minute';
set role anon;
select pg_temp.ok((select (guest_request_command(:'tk', :'gate1', 'pulso'))->>'erro' = 'Limite de usos atingido.'),
                  'limite de usos da chave');

-- ---------- AUDITORIA ----------
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', :'ADMIN', false);
select pg_temp.ok((select count(*) > 5 from audit_logs where action like 'residence%' or action like 'gates%'
                   or action like 'devices%'), 'alterações ficam registradas');
select pg_temp.ok((select count(*) >= 1 from audit_logs where action = 'acionamento.negado'),
                  'tentativa negada fica registrada');
select pg_temp.ok((select count(*) >= 1 from audit_logs where action = 'chave_temporaria.negada'),
                  'uso indevido de chave fica registrado');

reset role;

-- ---------- NOTIFICAÇÕES DE CADASTRO ----------
select pg_temp.ok((select count(*) = 6 from admin_notifications where kind = 'novo_cadastro'), 'cada cadastro gera uma notificação');
select pg_temp.ok((select count(*) = 6 from net.chamadas where url like '%/notify-admin'), 'cada notificação dispara o envio');
select pg_temp.ok((select message like '%Morador%morador@t.com%' from admin_notifications where payload->>'email' = 'morador@t.com'),
                  'mensagem traz nome e e-mail');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select pg_temp.ok((select count(*) = 0 from admin_notifications), 'admin comum não vê notificações da plataforma');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select pg_temp.ok((select count(*) = 6 from admin_notifications), 'super admin vê as notificações');
reset role;

-- ---------- COMUNICADOS E RELATÓRIOS ----------
-- (a organização A foi excluída acima; recria um cenário mínimo)
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into organizations (name) values ('Condomínio C') returning id as org_c \gset
select add_org_admin(:'org_c', 'admin@t.com');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
insert into residences (org_id, name) values (:'org_c', 'Casa 1') returning id as rc1 \gset
insert into residences (org_id, name) values (:'org_c', 'Casa 2') returning id as rc2 \gset
select add_residence_member(:'rc1', 'morador@t.com', 'morador');
select add_residence_member(:'rc2', 'titular@t.com', 'titular');
insert into announcements (org_id, title, body, created_by) values (:'org_c', 'Manutenção', 'Portão parado amanhã', auth.uid()) returning id as an_all \gset
insert into announcements (org_id, residence_id, title, body, created_by) values (:'org_c', :'rc2', 'Só Casa 2', 'Aviso específico', auth.uid()) returning id as an_c2 \gset
select pg_temp.ok((select (report_stats(:'org_c', now() - interval '7 days', now() + interval '1 minute'))->'moradores'->>'ativos' = '2'),
                  'relatório conta moradores ativos');
select pg_temp.ok((select jsonb_array_length((report_stats(:'org_c', now() - interval '7 days', now() + interval '1 minute'))->'por_dia') = 8),
                  'relatório traz série diária');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);
select pg_temp.ok((select count(*) = 1 from announcements), 'morador da Casa 1 vê só o comunicado geral');
insert into announcement_reads (announcement_id, user_id) values (:'an_all', auth.uid());
select pg_temp.ok(pg_temp.erro(format($$insert into announcements (org_id, title, body, created_by) values (%L, 'x', 'y', auth.uid())$$, :'org_c')) is not null,
                  'morador não publica comunicado');
select pg_temp.ok(pg_temp.erro(format($$insert into announcement_reads values (%L, auth.uid())$$, :'an_c2')) is not null,
                  'morador não marca como lido comunicado que não vê');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
select pg_temp.ok((select count(*) = 2 from announcements), 'titular da Casa 2 vê geral e específico');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false);
select pg_temp.ok((select count(*) = 0 from announcements), 'admin de outro cliente não vê comunicados');
select pg_temp.ok((select (report_stats(:'org_c', now() - interval '7 days', now()))->'moradores'->>'ativos' = '0'),
                  'relatório de outro cliente vem vazio');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select pg_temp.ok((select count(*) = 1 from announcement_reads), 'admin vê quem leu');
select pg_temp.ok((select count(*) >= 2 from audit_logs where action = 'announcements.insert'), 'comunicados ficam na auditoria');
reset role;
\echo TODOS_OS_TESTES_PASSARAM
