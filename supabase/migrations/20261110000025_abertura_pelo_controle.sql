-- Aberturas feitas fora do app (controle remoto, botoeira, chave) também aparecem no histórico.
-- Precisa do sensor de portão fechado ligado ao ESP32: quando ele avisa "fechado → aberto"
-- e ninguém pediu abertura pelo app nos últimos 90 segundos, registra "aberto pelo controle".
alter table public.commands drop constraint if exists commands_source_check;
alter table public.commands add constraint commands_source_check
  check (source in ('app', 'chave_temporaria', 'manual'));

create or replace function public.log_manual_opening() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_res uuid;
begin
  if new.device_id is null or old.state is distinct from 'fechado' or new.state is distinct from 'aberto' then
    return null;
  end if;
  if exists (select 1 from public.commands c
              where c.gate_id = new.id and c.source <> 'manual'
                and c.status in ('pendente', 'enviado', 'sucesso')
                and c.created_at > now() - interval '90 seconds') then
    return null;  -- foi aberto pelo app ou por chave de visitante
  end if;
  -- Portão de uma residência só: o titular também vê no histórico dele.
  select case when count(*) = 1 then min(gr.residence_id::text)::uuid end into v_res
    from public.gate_residences gr where gr.gate_id = new.id;
  insert into public.commands (org_id, gate_id, device_id, residence_id, action, status, source, created_at, sent_at, completed_at)
  values (new.org_id, new.id, new.device_id, v_res, 'abrir', 'sucesso', 'manual', now(), now(), now());
  return null;
end $$;

drop trigger if exists log_manual_opening on public.gates;
create trigger log_manual_opening after update of state on public.gates
for each row when (old.state is distinct from new.state)
execute function public.log_manual_opening();

revoke execute on function public.log_manual_opening() from public, anon, authenticated;
