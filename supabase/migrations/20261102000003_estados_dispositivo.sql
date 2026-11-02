-- Atualiza o estado dos portões informado pelo equipamento (sem retirar comandos da fila).
create function public.device_set_states(p_device uuid, p_states jsonb) returns void
language sql security definer set search_path = '' as $$
  update public.gates g set state = s.value, state_updated_at = now()
  from jsonb_each_text(case when jsonb_typeof(p_states) = 'object' then p_states else '{}'::jsonb end) s
  where g.device_id = p_device and g.channel = s.key::int
    and s.value in ('aberto','fechado','movendo','desconhecido')
    and g.state is distinct from s.value;
$$;

revoke execute on function public.device_set_states(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.device_set_states(uuid, jsonb) to service_role;
