-- Saúde do sistema: quanto dos limites do plano grátis está sendo usado.
-- Só super admin (pelo app) ou acesso direto ao banco. O app anônimo não tem permissão de executar.
create function public.system_health() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_db numeric; v_placas int; v_users int; v_locais int; v_edge numeric; r jsonb;
begin
  -- Com usuário logado, só o super admin. Sem usuário (painel do banco / service role), liberado.
  if auth.uid() is not null and not public.is_super_admin() then
    raise exception 'Sem permissão.';
  end if;
  v_db := round(pg_database_size(current_database()) / 1048576.0, 1);
  select count(*) into v_placas from public.devices where last_seen_at > now() - interval '1 day';
  select count(*) into v_users from auth.users where last_sign_in_at > now() - interval '30 days';
  select count(*) into v_locais from public.organizations;
  v_edge := v_placas * 130000;  -- long-poll de 20 s ≈ 130 mil chamadas/mês por placa
  r := jsonb_build_object(
    'banco_mb', v_db, 'banco_pct', round(v_db / 500 * 100),
    'placas_ativas', v_placas, 'chamadas_mes_estimadas', v_edge, 'chamadas_pct', round(v_edge / 500000 * 100),
    'usuarios_mes', v_users, 'usuarios_pct', round(v_users / 50000.0 * 100),
    'locais', v_locais, 'verificado_em', now());
  return r || jsonb_build_object('maior_pct', greatest((r->>'banco_pct')::int, (r->>'chamadas_pct')::int, (r->>'usuarios_pct')::int));
end $$;
revoke execute on function public.system_health() from public, anon;
grant execute on function public.system_health() to authenticated;
