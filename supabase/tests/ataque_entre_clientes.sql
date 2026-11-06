-- =====================================================================
-- ATAQUE ENTRE CLIENTES (somente leitura — tudo é desfeito no final)
-- Um administrador de uma casa tenta invadir a casa de outra pessoa de 25 jeitos,
-- e o dono de casa tenta virar "condomínio" para burlar o limite e a aprovação.
-- Rode no Supabase: SQL Editor → cole tudo → Run. Esperado: tudo "BLOQUEADO".
-- =====================================================================
begin;
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
 ('7b1f0c5e-0000-4000-8000-0000000000aa', 'atacante-teste@exemplo.invalid', '{"full_name":"Atacante"}', 'authenticated', 'authenticated'),
 ('7b1f0c5e-0000-4000-8000-0000000000bb', 'vitima-teste@exemplo.invalid', '{"full_name":"Vitima"}', 'authenticated', 'authenticated');
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
create temp table r (t text, v text);
grant all on r to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7b1f0c5e-0000-4000-8000-0000000000bb","role":"authenticated","aal":"aal1"}', true);
do $$ declare h jsonb; d jsonb; begin
  h := public.create_home('Casa Vitima');
  insert into ids values ('v_org', (h->>'org_id')::uuid), ('v_res', (h->>'residence_id')::uuid);
  d := public.create_device((h->>'org_id')::uuid, 'Central vitima', 'dc-esp32-https', null, null, null);
  insert into ids values ('v_dev', (d->>'device_id')::uuid);
  update public.gates set device_id = (d->>'device_id')::uuid where org_id = (h->>'org_id')::uuid;
  insert into ids select 'v_gate', id from public.gates where org_id = (h->>'org_id')::uuid limit 1;
end $$;
select set_config('request.jwt.claims', '{"sub":"7b1f0c5e-0000-4000-8000-0000000000aa","role":"authenticated","aal":"aal1"}', true);
do $$ declare h jsonb;
  vo uuid := (select v from ids where k='v_org'); vr uuid := (select v from ids where k='v_res');
  vd uuid := (select v from ids where k='v_dev'); vg uuid := (select v from ids where k='v_gate');
  ao uuid; ar uuid; ag uuid; n int; x text;
begin
  h := public.create_home('Casa Atacante'); ao := (h->>'org_id')::uuid; ar := (h->>'residence_id')::uuid;
  select id into ag from public.gates where org_id = ao limit 1;
  begin update public.organizations set kind = 'condominio' where id = ao; insert into r values ('casa virar condomínio', 'FALHA');
  exception when others then insert into r values ('casa virar condomínio', 'BLOQUEADO'); end;
  insert into r select 'ver portão da vítima', case when count(*)=0 then 'BLOQUEADO' else 'FALHA' end from public.gates where id = vg;
  insert into r select 'ver equipamento da vítima', case when count(*)=0 then 'BLOQUEADO' else 'FALHA' end from public.devices where id = vd;
  insert into r select 'ver casa da vítima', case when count(*)=0 then 'BLOQUEADO' else 'FALHA' end from public.residences where id = vr;
  update public.gates set name='hackeado' where id = vg; get diagnostics n = row_count; insert into r values ('renomear portão da vítima', case when n=0 then 'BLOQUEADO' else 'FALHA' end);
  begin update public.devices set name = 'x' where id = vd; get diagnostics n = row_count; insert into r values ('mexer no equipamento da vítima', case when n=0 then 'BLOQUEADO' else 'FALHA' end);
  exception when others then insert into r values ('mexer no equipamento da vítima', 'BLOQUEADO'); end;
  begin update public.devices set org_id = ao where id = vd; insert into r values ('roubar equipamento da vítima', 'FALHA');
  exception when others then insert into r values ('roubar equipamento da vítima', 'BLOQUEADO'); end;
  begin update public.gates set device_id = vd where id = ag; get diagnostics n = row_count; insert into r values ('ligar meu portão no ESP32 da vítima', case when n=0 then 'BLOQUEADO' else 'FALHA' end);
  exception when others then insert into r values ('ligar meu portão no ESP32 da vítima', 'BLOQUEADO'); end;
  begin insert into public.gate_residences values (vg, ar); insert into r values ('ligar portão da vítima na minha casa', 'FALHA');
  exception when others then insert into r values ('ligar portão da vítima na minha casa', 'BLOQUEADO'); end;
  begin insert into public.gate_residences values (ag, vr); insert into r values ('ligar meu portão na casa da vítima', 'FALHA');
  exception when others then insert into r values ('ligar meu portão na casa da vítima', 'BLOQUEADO'); end;
  begin update public.residences set org_id = ao where id = vr; get diagnostics n = row_count; insert into r values ('mover casa da vítima para mim', case when n=0 then 'BLOQUEADO' else 'FALHA' end);
  exception when others then insert into r values ('mover casa da vítima para mim', 'BLOQUEADO'); end;
  begin update public.residences set org_id = vo where id = ar; get diagnostics n = row_count; insert into r values ('enfiar minha casa no cliente da vítima', case when n=0 then 'BLOQUEADO' else 'FALHA' end);
  exception when others then insert into r values ('enfiar minha casa no cliente da vítima', 'BLOQUEADO'); end;
  begin x := public.create_invite(vr, 'titular', 1, 24, false)::text; insert into r values ('criar convite para casa da vítima', 'FALHA');
  exception when others then insert into r values ('criar convite para casa da vítima', 'BLOQUEADO'); end;
  begin x := public.create_temp_key(vr, 'x', array[vg], now(), now()+interval '1 day', null, null, null, 5)::text; insert into r values ('chave de visitante p/ portão da vítima', 'FALHA');
  exception when others then insert into r values ('chave de visitante p/ portão da vítima', 'BLOQUEADO'); end;
  begin x := public.create_temp_key(ar, 'x', array[vg], now(), now()+interval '1 day', null, null, null, 5)::text; insert into r values ('chave da minha casa apontando p/ portão da vítima', 'FALHA');
  exception when others then insert into r values ('chave da minha casa apontando p/ portão da vítima', 'BLOQUEADO'); end;
  begin x := public.rotate_device_secret(vd); insert into r values ('trocar segredo do ESP32 da vítima', 'FALHA');
  exception when others then insert into r values ('trocar segredo do ESP32 da vítima', 'BLOQUEADO'); end;
  begin x := public.create_pairing_code(vd)::text; insert into r values ('código de pareamento do ESP32 da vítima', 'FALHA');
  exception when others then insert into r values ('código de pareamento do ESP32 da vítima', 'BLOQUEADO'); end;
  begin x := public.add_residence_member(vr, 'atacante-teste@exemplo.invalid', 'titular')::text; insert into r values ('virar titular na casa da vítima', 'FALHA');
  exception when others then insert into r values ('virar titular na casa da vítima', 'BLOQUEADO'); end;
  begin x := public.add_org_admin(vo, 'atacante-teste@exemplo.invalid')::text; insert into r values ('virar admin do cliente da vítima', 'FALHA');
  exception when others then insert into r values ('virar admin do cliente da vítima', 'BLOQUEADO'); end;
  begin x := public.request_gate_command(vg, 'pulso', null, null)::text;
    insert into r values ('abrir portão da vítima', case when x like '%"ok": true%' then 'FALHA' else 'BLOQUEADO' end);
  exception when others then insert into r values ('abrir portão da vítima', 'BLOQUEADO'); end;
  begin x := public.report_stats(vo, now()-interval '30 days', now())::text; insert into r values ('relatório do cliente da vítima', case when x ~ '"total": [1-9]' then 'FALHA' else 'BLOQUEADO (vazio)' end);
  exception when others then insert into r values ('relatório do cliente da vítima', 'BLOQUEADO'); end;
  insert into r select 'ler auditoria da vítima', case when count(*)=0 then 'BLOQUEADO' else 'FALHA' end from public.audit_logs where org_id = vo;
  begin x := public.admin_reset_gate_pin('7b1f0c5e-0000-4000-8000-0000000000bb', vo)::text; insert into r values ('apagar senha de abertura da vítima', 'FALHA');
  exception when others then insert into r values ('apagar senha de abertura da vítima', 'BLOQUEADO'); end;
  begin x := public.admin_reset_gate_pin('7b1f0c5e-0000-4000-8000-0000000000bb', ao)::text; insert into r values ('apagar senha da vítima via meu cliente', case when x like '%true%' then 'FALHA' else 'BLOQUEADO' end);
  exception when others then insert into r values ('apagar senha da vítima via meu cliente', 'BLOQUEADO'); end;
  begin insert into public.announcements (org_id, title, body, created_by) values (vo, 'golpe', 'pix', auth.uid()); insert into r values ('comunicado falso aos moradores da vítima', 'FALHA');
  exception when others then insert into r values ('comunicado falso aos moradores da vítima', 'BLOQUEADO'); end;
  insert into r select 'ver perfil (e-mail) da vítima', case when count(*)=0 then 'BLOQUEADO' else 'FALHA' end from public.profiles where id = '7b1f0c5e-0000-4000-8000-0000000000bb';
end $$;
reset role;
select t as ataque, v as resultado, case when v like 'BLOQUEADO%' then '✅' else '❌' end as status from r;
rollback;
