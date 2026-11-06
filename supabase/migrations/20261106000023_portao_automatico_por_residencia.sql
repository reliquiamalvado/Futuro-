-- Toda residência nova já ganha o seu portão (ainda sem equipamento),
-- que aparece em "Portões e dispositivos" pronto para adicionar o ESP32.
create or replace function public.auto_gate_for_residence() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_gate uuid;
begin
  insert into public.gates (org_id, name, device_id)
  values (new.org_id, left('Portão · ' || trim(new.name), 80), null)
  returning id into v_gate;
  insert into public.gate_residences (gate_id, residence_id)
  values (v_gate, new.id)
  on conflict do nothing;
  return null;
end $$;

drop trigger if exists auto_gate_for_residence on public.residences;
create trigger auto_gate_for_residence after insert on public.residences
for each row execute function public.auto_gate_for_residence();

revoke execute on function public.auto_gate_for_residence() from public, anon, authenticated;
