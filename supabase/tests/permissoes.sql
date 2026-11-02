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

-- Super admin usa 2FA; as sessões dos testes são aal2 (exceto nos testes de 2FA no fim).
insert into auth.mfa_factors (user_id, status) values ('00000000-0000-0000-0000-00000000000a', 'verified');
select set_config('request.jwt.claim.aal', 'aal2', false);

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

-- ---------- CASAS E AGRUPAMENTOS ----------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000011', 'dono@t.com', '{"full_name":"Dono da Casa"}'),
  ('00000000-0000-0000-0000-000000000012', 'cliente@t.com', '{"full_name":"Cliente"}');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', false);
select (create_home('Casa do João', 'Rua A, 1'))->>'org_id' as home_org, (create_home('Casa de Praia'))->>'org_id' as home2 \gset
select pg_temp.ok((select count(*) = 2 from residence_members where user_id = auth.uid() and role = 'titular' and status = 'ativo'),
                  'dono vira titular das próprias casas');
select pg_temp.ok(is_org_admin(:'home_org'), 'dono administra a própria casa');
select (r->>'device_id') as hdev from (select create_device(:'home_org', 'ESP32 casa', 'dc-esp32-https') r) x \gset
insert into gates (org_id, device_id, name) values (:'home_org', :'hdev', 'Portão da garagem') returning id as hgate \gset
select pg_temp.ok((select count(*) = 1 from gate_residences where gate_id = :'hgate'), 'portão da casa é liberado automaticamente');
select pg_temp.ok((select count(*) = 1 from my_gates() where gate_id = :'hgate' and can_operate), 'dono já pode acionar o portão');
select create_home('Casa 3');
select pg_temp.ok(pg_temp.erro($$select create_home('Casa 4')$$) is not null, 'limite de 3 casas por conta');
select pg_temp.ok(pg_temp.erro($$select create_home('Outra', null, 'cliente@t.com')$$) is not null, 'usuário comum não cria casa para outra pessoa');
select pg_temp.ok((select count(*) = 0 from organizations where name = 'Condomínio C'), 'dono de casa não vê condomínios');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select (create_home('Casa Cliente', null, 'cliente@t.com'))->>'residence_id' as cres \gset
select pg_temp.ok((select role = 'titular' from residence_members where residence_id = :'cres'), 'super admin cria casa para cliente');

-- Agrupamentos e comunicados por bloco (Condomínio C: Casa 1 = morador, Casa 2 = titular)
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
update residences set block = 'Bloco A' where name = 'Casa 1' and org_id = :'org_c';
update residences set block = 'Bloco B' where name = 'Casa 2' and org_id = :'org_c';
insert into announcements (org_id, block, title, body, created_by) values (:'org_c', 'Bloco A', 'Água', 'Falta de água no Bloco A', auth.uid());
select pg_temp.ok(pg_temp.erro(format($$insert into announcements (org_id, residence_id, block, title, body, created_by) values (%L, %L, 'Bloco A', 'x', 'y', auth.uid())$$, :'org_c', :'rc1')) is not null,
                  'comunicado não mistura unidade e bloco');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);
select pg_temp.ok((select count(*) = 1 from announcements where block = 'Bloco A'), 'morador do Bloco A vê o aviso do bloco');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
select pg_temp.ok((select count(*) = 0 from announcements where block = 'Bloco A'), 'morador do Bloco B não vê o aviso do Bloco A');
reset role;

-- ---------- PERFIL NO CADASTRO E PEDIDOS ----------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000021', 'sindico@t.com', '{"full_name":"Síndico","account_type":"sindico"}'),
  ('00000000-0000-0000-0000-000000000022', 'hacker@t.com', '{"full_name":"H","account_type":"superadmin"}');
select pg_temp.ok((select account_type = 'sindico' from profiles where email = 'sindico@t.com'), 'perfil escolhido no cadastro é salvo');
select pg_temp.ok((select account_type is null from profiles where email = 'hacker@t.com'), 'perfil inválido é ignorado');
select pg_temp.ok((select message like '%Perfil: Síndico%' from admin_notifications where payload->>'email' = 'sindico@t.com'), 'aviso de cadastro mostra o perfil');

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000021', false);
insert into org_requests (user_id, kind, org_name, group_label, city, units) values (auth.uid(), 'condominio', 'Residencial Sol', 'Rua', 'Campinas', 80) returning id as req1 \gset
select pg_temp.ok(pg_temp.erro($$insert into org_requests (user_id, kind, org_name) values (auth.uid(), 'empresa', 'Outra')$$) is not null, 'só um pedido pendente por vez');
select pg_temp.ok(pg_temp.erro(format($$select review_org_request(%L, true)$$, :'req1')) is not null, 'solicitante não aprova o próprio pedido');
select pg_temp.ok(pg_temp.erro($$update profiles set is_super_admin = true where id = auth.uid()$$) is not null, 'perfil não vira super admin');
update profiles set account_type = 'empresa' where id = auth.uid();

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000e', false);
select pg_temp.ok((select count(*) = 0 from org_requests), 'outros usuários não veem pedidos');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select review_org_request(:'req1', true, 'Bem-vindo!') as novo_org \gset
select pg_temp.ok((select kind = 'condominio' and group_label = 'Rua' from organizations where id = :'novo_org'), 'aprovação cria o condomínio');
select pg_temp.ok((select count(*) = 1 from org_admins where org_id = :'novo_org' and user_id = '00000000-0000-0000-0000-000000000021'), 'solicitante vira administrador');
select pg_temp.ok(pg_temp.erro(format($$select review_org_request(%L, false)$$, :'req1')) is not null, 'pedido não é analisado duas vezes');
reset role;
select pg_temp.ok((select count(*) = 1 from admin_notifications where kind = 'pedido_cliente'), 'pedido gera aviso para o dono da plataforma');

-- ---------- 2FA E LIMITES ----------
set role authenticated;
select set_config('request.jwt.claim.aal', 'aal1', false);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select pg_temp.ok(not is_super_admin(), 'super admin sem 2FA na sessão perde os poderes');
select pg_temp.ok((select count(*) = 0 from org_requests), 'sem 2FA o super admin não vê pedidos');
select set_config('request.jwt.claim.aal', 'aal2', false);
select pg_temp.ok(is_super_admin(), 'super admin com 2FA tem os poderes');

-- Dono de casa ativa 2FA: sessão sem 2FA não aciona nem vê portões.
reset role;
insert into auth.mfa_factors (user_id, status) values ('00000000-0000-0000-0000-000000000011', 'verified');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', false);
select set_config('request.jwt.claim.aal', 'aal1', false);
select pg_temp.ok((select count(*) = 0 from my_gates()), 'quem ativou 2FA não usa o app com sessão sem 2FA');
select pg_temp.ok((select (request_gate_command(:'hgate', 'pulso'))->>'ok' = 'false'), 'senha vazada sem 2FA não abre o portão');
select set_config('request.jwt.claim.aal', 'aal2', false);
select pg_temp.ok((select count(*) >= 1 from my_gates()), 'com 2FA o dono usa normalmente');

-- Quem não ativou 2FA continua usando normalmente.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);
select set_config('request.jwt.claim.aal', 'aal1', false);
select pg_temp.ok(is_residence_member(:'rc1'), 'usuário sem 2FA continua com acesso');

-- Limite de convites inválidos.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000e', false);
select redeem_invite('ERRADO' || g) from generate_series(1, 10) g;
select pg_temp.ok((select (redeem_invite('ERRADO11'))->>'erro' like 'Muitas tentativas%'), 'convites: bloqueia após 10 tentativas inválidas');
reset role;

-- Limite de registros de falha de equipamento por IP.
set role service_role;
select device_auth_failed('00000000-0000-0000-0000-000000000099', '1.2.3.4') from generate_series(1, 40);
reset role;
select pg_temp.ok((select count(*) = 20 from audit_logs where details->>'ip' = '1.2.3.4'), 'falhas de equipamento: registra no máximo 20 por IP');
\echo TODOS_OS_TESTES_PASSARAM
