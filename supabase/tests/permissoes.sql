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
reset role;
insert into gate_pins (user_id, pin_hash) values ('00000000-0000-0000-0000-00000000000d', extensions.crypt('2468', extensions.gen_salt('bf', 4)));
set role authenticated;
select set_config('request.jwt.claim.sub', :'MOR', false);
select pg_temp.ok((select count(*) = 1 from residence_members), 'morador só vê o próprio vínculo');
select pg_temp.ok((select count(*) = 1 from my_gates() where can_operate), 'morador ativo vê o portão');
select pg_temp.ok((select (request_gate_command(:'gate1', 'pulso', '2468'))->>'erro' = 'Dispositivo offline.'),
                  'dispositivo offline é informado');
select pg_temp.ok((select (request_gate_command(:'gate1', 'abrir', '2468'))->>'ok' = 'false'),
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
select (request_gate_command(:'gate1', 'pulso', '2468'))->>'command_id' as cmd1 \gset
select pg_temp.ok(:'cmd1' <> '', 'morador aciona portão online');
select pg_temp.ok((select (request_gate_command(:'gate1', 'pulso', '2468'))->>'erro' like 'Aguarde%'), 'limite de 2 s entre comandos');

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
select pg_temp.ok(not is_super_admin(), 'super admin que ATIVOU 2FA precisa dela na sessão');
select pg_temp.ok((select count(*) = 0 from org_requests), 'sessão sem o código 2FA não vê pedidos');
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

-- ---------- BLINDAGEM ----------
select decrypted_secret as notify_secret from vault.decrypted_secrets where name = 'notify_admin_secret' \gset
set role service_role;
select pg_temp.ok(device_ip_blocked('1.2.3.4'), 'IP com 20 falhas de equipamento fica bloqueado');
select pg_temp.ok(not device_ip_blocked('5.6.7.8'), 'outros IPs continuam liberados');
select pg_temp.ok(not notify_secret_ok('chute'), 'segredo errado de notificação é recusado');
select pg_temp.ok(notify_secret_ok(:'notify_secret'),
                  'segredo certo de notificação é aceito');
reset role;
select pg_temp.ok((select (body is not null) from net.chamadas order by criado desc limit 1), 'notificação continua sendo disparada');

-- Varredura do catálogo: nada aberto por engano.
select pg_temp.ok(not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                              where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
                  'todas as tabelas têm RLS');
select pg_temp.ok(not exists (select 1 from information_schema.role_table_grants
                              where table_schema = 'public' and grantee = 'anon'),
                  'anônimo não tem acesso a nenhuma tabela');
select pg_temp.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                              where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
                                and p.proname not in ('guest_key_info','guest_request_command','guest_command_status')),
                  'anônimo só executa as funções de chave temporária');
select pg_temp.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                              where n.nspname = 'public' and p.prosecdef
                                and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')),
                  'toda função privilegiada tem search_path fixo');
select pg_temp.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                              where n.nspname = 'public'
                                and p.proname in ('device_auth','device_poll','device_ack','device_set_states','device_auth_failed',
                                                  'device_ip_blocked','notify_secret_ok','enqueue_command','log_event','temp_key_check',
                     'check_gate_pin','issue_unlock_ticket','consume_unlock_ticket','session_is_fresh','pin_is_weak','pair_device')
                                and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))),
                  'funções internas não são chamáveis pelo app');
create table public.tabela_esquecida (id int);
select pg_temp.ok(not has_table_privilege('anon', 'public.tabela_esquecida', 'select'), 'tabela nova nasce fechada para o anônimo');
drop table public.tabela_esquecida;

-- ---------- CONFIRMAÇÃO PARA ABRIR (celular roubado) ----------
-- Cenário: Casa C1 do Condomínio C, morador (d) e titular (c) com portão online.
reset role;
insert into devices (id, org_id, name, driver_id, last_seen_at) values ('00000000-0000-0000-0000-0000000000c1', :'org_c', 'ESP C', 'dc-esp32-https', now());
insert into gates (id, org_id, device_id, name) values ('00000000-0000-0000-0000-0000000000c2', :'org_c', '00000000-0000-0000-0000-0000000000c1', 'Portão C');
insert into gate_residences values ('00000000-0000-0000-0000-0000000000c2', :'rc1');
\set gc '00000000-0000-0000-0000-0000000000c2'

-- 1) Morador sem senha nem biometria: precisa configurar antes de abrir.
reset role;
delete from gate_pins where user_id = '00000000-0000-0000-0000-00000000000d';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);
select set_config('request.jwt.claim.session_id', '00000000-0000-0000-0000-0000000005e1', false);
select pg_temp.ok((select (request_gate_command(:'gc', 'pulso'))->>'confirmacao' = 'configurar'), 'sem senha de abertura não aciona (pede para configurar)');

-- 2) Sessão antiga (ex.: celular roubado com app aberto) não consegue criar senha.
reset role;
insert into auth.sessions (id, user_id, created_at) values ('00000000-0000-0000-0000-0000000005e1', '00000000-0000-0000-0000-00000000000d', now() - interval '3 days');
set role authenticated;
select pg_temp.ok((select (set_gate_pin('8264'))->>'reautenticar' = 'true'), 'sessão antiga não cria senha de abertura (pede novo login)');

-- 3) Login recente cria a senha; senhas fracas são recusadas.
reset role;
insert into auth.sessions (id, user_id, created_at) values ('00000000-0000-0000-0000-0000000005e2', '00000000-0000-0000-0000-00000000000d', now());
set role authenticated;
select set_config('request.jwt.claim.session_id', '00000000-0000-0000-0000-0000000005e2', false);
select pg_temp.ok((select (set_gate_pin('1234'))->>'ok' = 'false'), 'senha sequencial é recusada');
select pg_temp.ok((select (set_gate_pin('7777'))->>'ok' = 'false'), 'senha repetida é recusada');
select pg_temp.ok((select (set_gate_pin('12a4'))->>'ok' = 'false'), 'senha com letras é recusada');
select pg_temp.ok((select (set_gate_pin('8264'))->>'ok' = 'true'), 'login recente cria a senha de abertura');
reset role;
select pg_temp.ok((select pin_hash <> '8264' and pin_hash like '$2%' from gate_pins where user_id = '00000000-0000-0000-0000-00000000000d'), 'senha guardada só como hash (bcrypt)');
set role authenticated;

-- 4) Abrir exige a senha a cada vez.
select pg_temp.ok((select (request_gate_command(:'gc', 'pulso'))->>'confirmacao' = 'necessaria'), 'sem informar a senha não abre');
select pg_temp.ok((select (request_gate_command(:'gc', 'pulso', '0000'))->>'erro' = 'Senha de abertura incorreta.'), 'senha errada não abre');
select pg_temp.ok((select (request_gate_command(:'gc', 'pulso', '8264'))->>'ok' = 'true'), 'senha certa abre');

-- 5) Ladrão com sessão antiga não troca a senha sem saber a atual.
select set_config('request.jwt.claim.session_id', '00000000-0000-0000-0000-0000000005e1', false);
select pg_temp.ok((select (set_gate_pin('9157', '1111'))->>'ok' = 'false'), 'sessão antiga não troca a senha sem a atual');

-- 6) 5 erros bloqueiam por 15 minutos, mesmo com a senha certa depois.
select request_gate_command(:'gc', 'pulso', '0000') from generate_series(1, 4);
select pg_temp.ok((select (request_gate_command(:'gc', 'pulso', '0000'))->>'confirmacao' = 'bloqueada'), '5 senhas erradas bloqueiam');
select pg_temp.ok((select (request_gate_command(:'gc', 'pulso', '8264'))->>'confirmacao' = 'bloqueada'), 'bloqueado mesmo com a senha certa');
reset role;
select pg_temp.ok((select count(*) >= 1 from audit_logs where action = 'abertura.senha_bloqueada'), 'bloqueio fica registrado como crítico');
select pg_temp.ok((select pg_temp.erro($$select * from gate_pins$$) is null), 'super usuário do banco vê a tabela (controle)');
set role authenticated;
select pg_temp.ok(pg_temp.erro($$select * from gate_pins$$) is not null, 'app não lê os hashes das senhas');

-- 7) Biometria: tíquete emitido pela Edge Function vale uma vez e por 60 s.
reset role;
update gate_pins set locked_until = null, failed = 0;
update commands set created_at = now() - interval '1 minute';
set role service_role;
select issue_unlock_ticket('00000000-0000-0000-0000-00000000000d') as tk1 \gset
select issue_unlock_ticket('00000000-0000-0000-0000-00000000000c') as tk_outro \gset
reset role;
set role authenticated;
select pg_temp.ok((select (request_gate_command(:'gc', 'pulso', null, :'tk_outro'))->>'confirmacao' = 'necessaria'), 'tíquete de outra pessoa não serve');
select pg_temp.ok((select (request_gate_command(:'gc', 'pulso', null, :'tk1'))->>'ok' = 'true'), 'tíquete de biometria abre');
reset role; update commands set created_at = now() - interval '1 minute'; set role authenticated;
select pg_temp.ok((select (request_gate_command(:'gc', 'pulso', null, :'tk1'))->>'confirmacao' = 'necessaria'), 'tíquete não é reutilizado');
select pg_temp.ok(pg_temp.erro($$select issue_unlock_ticket(auth.uid())$$) is not null, 'app não emite tíquete sozinho');
select pg_temp.ok(pg_temp.erro($$insert into webauthn_credentials (id, user_id, public_key) values ('x', auth.uid(), 'y')$$) is not null,
                  'app não cadastra biometria direto (só pela função que valida)');

-- 8) Chave temporária do visitante continua funcionando sem senha.
reset role;

-- ---------- SUPER ADMIN COM TODAS AS PERMISSÕES ----------
reset role;
delete from auth.mfa_factors where user_id = '00000000-0000-0000-0000-00000000000a';
insert into gate_pins (user_id, pin_hash) values ('00000000-0000-0000-0000-00000000000a', extensions.crypt('5719', extensions.gen_salt('bf', 4)));
update commands set created_at = now() - interval '1 minute';
update devices set last_seen_at = now() where id = '00000000-0000-0000-0000-0000000000c1';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select set_config('request.jwt.claim.aal', 'aal1', false);
select pg_temp.ok(not is_super_admin(), 'super admin sem 2FA fica sem os poderes (2FA obrigatória para ele)');
select pg_temp.ok((select count(*) = 0 from organizations where id = :'org_c'), 'super admin sem 2FA não vê clientes alheios');
select set_config('request.jwt.claim.aal', 'aal2', false);
select pg_temp.ok(is_super_admin(), 'super admin com o código do celular tem todos os poderes');
select pg_temp.ok((select count(*) >= 1 from organizations where id = :'org_c'), 'super admin vê todos os clientes');
select pg_temp.ok((select count(*) >= 1 from my_gates() where gate_id = :'gc' and can_operate), 'super admin vê e pode acionar portão de qualquer cliente');
select pg_temp.ok((select (request_gate_command(:'gc', 'pulso'))->>'confirmacao' = 'necessaria'), 'super admin também precisa da senha de abertura');
select pg_temp.ok((select (request_gate_command(:'gc', 'pulso', '5719'))->>'ok' = 'true'), 'super admin aciona portão de qualquer cliente com a senha');
reset role;
select pg_temp.ok((select count(*) >= 1 from audit_logs where action = 'acionamento.super_admin'), 'acionamento do super admin fica destacado na auditoria');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000e', false);
select pg_temp.ok((select count(*) = 0 from my_gates()), 'usuário comum continua sem ver portões alheios');
reset role;

-- ---------- PORTÃO SEM EQUIPAMENTO ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select set_config('request.jwt.claim.aal', 'aal2', false);
insert into gates (org_id, name) values (:'org_c', 'Portão novo') returning id as gnovo \gset
select pg_temp.ok(:'gnovo' <> '', 'admin cadastra portão sem equipamento');
insert into gate_residences values (:'gnovo', :'rc1');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);
select pg_temp.ok((select not online and not can_operate from my_gates() where gate_id = :'gnovo'), 'portão sem equipamento aparece offline e sem acionar');
reset role;
insert into gate_pins (user_id, pin_hash) values ('00000000-0000-0000-0000-00000000000d', extensions.crypt('8264', extensions.gen_salt('bf', 4)))
  on conflict (user_id) do update set pin_hash = excluded.pin_hash, failed = 0, locked_until = null;
set role authenticated;
select pg_temp.ok((select (request_gate_command(:'gnovo', 'pulso', '8264'))->>'erro' = 'Este portão ainda não tem equipamento vinculado.'),
                  'acionar portão sem equipamento dá mensagem clara');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
update gates set device_id = '00000000-0000-0000-0000-0000000000c1', channel = 2 where id = :'gnovo';
select pg_temp.ok((select device_id is not null from gates where id = :'gnovo'), 'admin vincula o equipamento depois');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false);
select pg_temp.ok(pg_temp.erro(format($$update gates set device_id = null where id = %L$$, :'gnovo')) is not null
                  or (select count(*) = 0 from gates where id = :'gnovo'), 'admin de outro cliente não mexe no portão');
reset role;
delete from devices where id = '00000000-0000-0000-0000-0000000000c1';
select pg_temp.ok((select count(*) = 2 and bool_and(device_id is null) from gates where id in (:'gnovo', :'gc')),
                  'excluir equipamento mantém os portões (sem equipamento)');
select pg_temp.ok((select count(*) >= 1 from commands where gate_id = :'gc'), 'excluir equipamento mantém o histórico de acionamentos');

-- ---------- PAREAMENTO DO EQUIPAMENTO ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select (r->>'device_id') as pdev from (select create_device(:'org_c', 'ESP pareamento', 'dc-esp32-https') r) x \gset
select (create_pairing_code(:'pdev'))->>'codigo' as pcode \gset
select pg_temp.ok(length(:'pcode') = 8, 'admin gera código de pareamento de 8 caracteres');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false);
select pg_temp.ok(pg_temp.erro(format($$select create_pairing_code(%L)$$, :'pdev')) is not null, 'admin de outro cliente não gera código');
select pg_temp.ok(pg_temp.erro(format($$select pair_device(%L, '1.1.1.1')$$, :'pcode')) is not null, 'app não consegue parear direto (só a função do equipamento)');
reset role;
select pg_temp.ok(not exists (select 1 from device_pairings where code_hash = :'pcode'), 'código guardado só como hash');
set role service_role;
select pg_temp.ok((select (pair_device('ERRADO99', '7.7.7.7'))->>'ok' = 'false'), 'código errado é recusado');
select pair_device(:'pcode', '8.8.8.8') as par \gset
select pg_temp.ok((:'par'::jsonb)->>'device_id' = :'pdev', 'código certo entrega as credenciais do equipamento');
select pg_temp.ok(device_auth(:'pdev', (:'par'::jsonb)->>'secret'), 'segredo recebido no pareamento autentica o equipamento');
select pg_temp.ok((select (pair_device(:'pcode', '8.8.8.8'))->>'ok' = 'false'), 'código não pode ser usado duas vezes');
select pair_device('CHUTE' || g, '6.6.6.6') from generate_series(1, 20) g;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select (create_pairing_code(:'pdev'))->>'codigo' as pcode2 \gset
reset role;
set role service_role;
select pg_temp.ok((select (pair_device(:'pcode2', '6.6.6.6'))->>'erro' = 'muitas tentativas, aguarde'), 'IP com 20 códigos errados fica bloqueado');
reset role;

-- ---------- SENHA DE ABERTURA ESQUECIDA (1 chance, depois só o administrador) ----------
reset role;
update gate_pins set locked_until = null, failed = 0;
set role authenticated;
select set_config('request.jwt.claim.sub', :'MOR', false);
select set_config('request.jwt.claim.session_id', '00000000-0000-0000-0000-0000000005e1', false);
select pg_temp.ok((select (set_gate_pin('5937', null, true))->>'reautenticar' = 'true'), 'esqueci a senha com sessão antiga: pede novo login');
select pg_temp.ok((select (my_unlock_methods())->>'recuperacoes_restantes' = '1'), 'começa com 1 chance de recuperação');
select set_config('request.jwt.claim.session_id', '00000000-0000-0000-0000-0000000005e2', false);
select pg_temp.ok((select (set_gate_pin('5937', null, true))->>'ok' = 'true'), 'esqueci a senha com login recente: recupera');
select pg_temp.ok((select (my_unlock_methods())->>'recuperacoes_restantes' = '0'), 'a chance é gasta');
select pg_temp.ok((select (set_gate_pin('6248', null, true))->>'precisa_admin' = 'true'), 'segunda vez: só com o administrador');
select pg_temp.ok((select (set_gate_pin('6248', '0000'))->>'ok' = 'false'), 'trocar exige a senha atual, mesmo com login recente');
select pg_temp.ok((select (set_gate_pin('6248', '5937'))->>'ok' = 'true'), 'quem lembra a senha troca quando quiser');
select request_gate_command(:'gc', 'pulso', '6248') as abre \gset
select pg_temp.ok((:'abre'::jsonb)->>'confirmacao' is null and (:'abre'::jsonb)->>'erro' is distinct from 'Senha de abertura incorreta.', 'nova senha é aceita para acionar');
select pg_temp.ok((select count(*) = 0 from org_pin_status(:'org_c')), 'morador não vê a situação das senhas dos outros');
select pg_temp.ok(pg_temp.erro(format($$select admin_reset_gate_pin(%L, %L)$$, :'TIT', :'org_c')) is not null, 'morador não libera senha de ninguém');
select pg_temp.ok((select (admin_reset_gate_pin(:'MOR', :'org_c'))->>'ok' = 'false'), 'ninguém libera a própria senha');
select set_config('request.jwt.claim.sub', :'ADMB', false);
select pg_temp.ok(pg_temp.erro(format($$select admin_reset_gate_pin(%L, %L)$$, :'MOR', :'org_c')) is not null, 'administrador de outro condomínio não libera');
select set_config('request.jwt.claim.sub', :'ADMIN', false);
select pg_temp.ok((select recuperacoes_restantes = 0 and tem_senha from org_pin_status(:'org_c') where user_id = :'MOR'), 'administrador vê que o morador já usou a chance');
select pg_temp.ok((select (admin_reset_gate_pin(:'MOR', :'org_c'))->>'ok' = 'true'), 'administrador do condomínio libera a senha do morador');
reset role;
select pg_temp.ok(not exists (select 1 from gate_pins where user_id = :'MOR'), 'senha antiga apagada');
select pg_temp.ok(exists (select 1 from audit_logs where action = 'abertura.senha_liberada_admin'), 'liberação fica no histórico');
set role authenticated;
select set_config('request.jwt.claim.sub', :'MOR', false);
select pg_temp.ok((select (set_gate_pin('7381'))->>'ok' = 'true'), 'morador cria a nova senha (login recente)');
select pg_temp.ok((select (my_unlock_methods())->>'recuperacoes_restantes' = '1'), 'e ganha de novo 1 chance');
reset role;

-- ---------- PRIVACIDADE (LGPD) ----------
set role authenticated;
select set_config('request.jwt.claim.sub', :'MOR', false);
select pg_temp.ok((select count(*) >= 1 from my_activity()), 'pessoa vê a própria atividade');
select set_config('request.jwt.claim.sub', :'EST', false);
select pg_temp.ok((select count(*) = 0 from my_activity() where action = 'abertura.senha_liberada_admin'), 'ninguém vê a atividade da conta de outra pessoa');
select set_config('request.jwt.claim.sub', :'MOR', false);
select pg_temp.ok((select (export_my_data())->'perfil'->>'email' = 'morador@t.com'), 'exportação traz os próprios dados');
select pg_temp.ok((select (export_my_data())::text not like '%$2%' and (export_my_data())::text not like '%pin_hash%'), 'exportação não traz senhas nem hashes');
select pg_temp.ok((select (account_deletion_check())->>'ok' = 'true'), 'morador comum pode excluir a conta');
select set_config('request.jwt.claim.sub', :'ADMIN', false);
select pg_temp.ok((select (account_deletion_check())->>'ok' = 'false'), 'único administrador com moradores não pode excluir a conta');
select set_config('request.jwt.claim.sub', :'SUPER', false);
select pg_temp.ok((select (account_deletion_check())->>'ok' = 'false'), 'super admin não exclui a conta por aqui');
reset role;
set role anon;
select pg_temp.ok(pg_temp.erro($$select export_my_data()$$) is not null, 'anônimo não exporta dados');
reset role;

-- ---------- SAÚDE DO SISTEMA ----------
set role authenticated;
select set_config('request.jwt.claim.sub', :'SUPER', false);
select pg_temp.ok((select (system_health()) ? 'maior_pct'), 'super admin vê a saúde do sistema');
select set_config('request.jwt.claim.sub', :'ADMIN', false);
select pg_temp.ok(pg_temp.erro($$select system_health()$$) is not null, 'administrador comum não vê a saúde do sistema');
reset role;

-- ---------- NOVA SENHA DE ABERTURA PELA BIOMETRIA ----------
set role authenticated;
select set_config('request.jwt.claim.sub', :'MOR', false);
select pg_temp.ok((select (set_gate_pin_biometric('4826', 'tiquete-falso'))->>'ok' = 'false'), 'sem biometria confirmada não troca a senha');
reset role;
select issue_unlock_ticket(:'MOR') as tbio \gset
set role authenticated;
select pg_temp.ok((select (set_gate_pin_biometric('1234', :'tbio'))->>'ok' = 'false'), 'senha fraca é recusada mesmo com biometria');
reset role;
select issue_unlock_ticket(:'MOR') as tbio2 \gset
set role authenticated;
select pg_temp.ok((select (set_gate_pin_biometric('4826', :'tbio2'))->>'ok' = 'true'), 'biometria confirmada cria nova senha');
select pg_temp.ok((select (my_unlock_methods())->>'recuperacoes_restantes' = '1'), 'recuperar pela biometria não gasta a chance');
select pg_temp.ok((select (set_gate_pin_biometric('5937', :'tbio2'))->>'ok' = 'false'), 'tíquete da biometria vale uma vez só');
select set_config('request.jwt.claim.sub', :'TIT', false);
reset role;
select issue_unlock_ticket(:'MOR') as tbio3 \gset
set role authenticated;
select pg_temp.ok((select (set_gate_pin_biometric('5937', :'tbio3'))->>'ok' = 'false'), 'tíquete de outra pessoa não serve');
reset role;
-- ---------- 2FA: SUPER ADMIN OBRIGATÓRIA E LIBERAÇÃO PELO ADMINISTRADOR ----------
reset role;
delete from auth.mfa_factors;
insert into auth.mfa_factors (user_id, status) values
  ('00000000-0000-0000-0000-00000000000d', 'verified'),
  ('00000000-0000-0000-0000-00000000000b', 'verified'),
  ('00000000-0000-0000-0000-00000000000a', 'verified');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select set_config('request.jwt.claim.aal', 'aal1', false);
select pg_temp.ok(not is_super_admin(), 'super admin com sessão sem código não tem poderes');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select set_config('request.jwt.claim.aal', 'aal2', false);
select pg_temp.ok((select count(*) = 2 from org_mfa_status(:'org_c')), 'administrador vê quem usa 2FA no seu cliente');
select pg_temp.ok((select (admin_reset_mfa('00000000-0000-0000-0000-00000000000b', :'org_c'))->>'ok' = 'false'), 'ninguém libera a própria 2FA');
select pg_temp.ok((select (admin_reset_mfa('00000000-0000-0000-0000-00000000000a', :'org_c'))->>'ok' = 'false'), '2FA do dono da plataforma não sai pelo app');
select pg_temp.ok((select (admin_reset_mfa('00000000-0000-0000-0000-00000000000d', :'org_c'))->>'ok' = 'true'), 'administrador libera a 2FA de morador que perdeu o celular');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000e', false);
select pg_temp.ok((select count(*) = 0 from org_mfa_status(:'org_c')), 'quem não é administrador não vê quem usa 2FA');
select pg_temp.ok(pg_temp.erro($$select admin_reset_mfa('00000000-0000-0000-0000-00000000000b', '$$ || :'org_c' || $$')$$) is not null, 'usuário comum não libera 2FA de ninguém');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select pg_temp.ok((select (admin_reset_mfa('00000000-0000-0000-0000-00000000000b', :'org_c'))->>'ok' = 'true'), 'super admin libera a 2FA de um administrador');
reset role;
select pg_temp.ok((select count(*) = 1 from auth.mfa_factors), 'só a 2FA do super admin continua');
select pg_temp.ok((select count(*) = 2 from audit_logs where action = 'conta.2fa_liberada_admin'), 'liberações de 2FA ficam na auditoria');
delete from auth.mfa_factors;
-- ---------- RESIDÊNCIA NOVA JÁ GANHA O PORTÃO ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select set_config('request.jwt.claim.aal', 'aal2', false);
insert into residences (org_id, name) values (:'org_c', 'Casa 77') returning id as r77 \gset
select pg_temp.ok((select count(*) = 1 from gates g join gate_residences gr on gr.gate_id = g.id
                    where gr.residence_id = :'r77' and g.name = 'Portão · Casa 77' and g.device_id is null),
                  'residência nova já aparece com o seu portão, sem equipamento');
select pg_temp.ok((select count(*) = 1 from gate_residences gr join gates g on g.id = gr.gate_id
                    where g.name = 'Portão · Casa 77'), 'portão automático fica só na residência dele');
select (create_home('Casa Auto')->>'residence_id') as rauto \gset
select pg_temp.ok((select count(*) = 1 from gates g join gate_residences gr on gr.gate_id = g.id
                    where gr.residence_id = :'rauto' and g.device_id is null), 'casa criada pelo assistente também ganha o portão');
reset role;

-- ---------- ATAQUE: DONO DE CASA VIRA CONDOMÍNIO ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select set_config('request.jwt.claim.aal', 'aal2', false);
select (create_home('Casa Golpe')->>'org_id') as org_golpe \gset
select pg_temp.ok(pg_temp.erro(format($$update organizations set kind = 'condominio' where id = %L$$, :'org_golpe')) is not null,
                  'dono de casa não transforma a casa em condomínio');
select pg_temp.ok(pg_temp.erro(format($$update organizations set created_by = '00000000-0000-0000-0000-00000000000a' where id = %L$$, :'org_golpe')) is not null,
                  'dono de casa não troca o criador do cliente');
select pg_temp.ok(pg_temp.erro(format($$update organizations set name = 'Casa Nova' where id = %L$$, :'org_golpe')) is null,
                  'dono de casa continua podendo renomear');
select pg_temp.ok(pg_temp.erro(format($$update residences set id = gen_random_uuid() where id = %L$$, :'rc1')) is not null,
                  'identificador da residência não muda');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select pg_temp.ok(pg_temp.erro(format($$update organizations set kind = 'condominio' where id = %L$$, :'org_golpe')) is null,
                  'super admin pode mudar o tipo do cliente');
reset role;

\echo TODOS_OS_TESTES_PASSARAM
