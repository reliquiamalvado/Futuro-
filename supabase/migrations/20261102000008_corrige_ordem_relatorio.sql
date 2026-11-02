-- Ordena portões do relatório pelo total numérico.
create or replace function public.report_stats(p_org uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_tz text := coalesce((select timezone from public.organizations where id = p_org), 'America/Sao_Paulo');
  v jsonb;
begin
  if p_to <= p_from or p_to - p_from > interval '366 days' then
    raise exception 'Período inválido (máximo de 1 ano).';
  end if;

  with
  cmd as (
    select c.* from public.commands c
    where c.created_at >= p_from and c.created_at < p_to and (p_org is null or c.org_id = p_org)
  ),
  mem as (
    select m.* from public.residence_members m join public.residences r on r.id = m.residence_id
    where p_org is null or r.org_id = p_org
  ),
  dias as (
    select d::date as dia
    from generate_series((p_from at time zone v_tz)::date, ((p_to - interval '1 second') at time zone v_tz)::date,
                         interval '1 day') d
  )
  select jsonb_build_object(
    'moradores', jsonb_build_object(
       'ativos',     (select count(*) from mem where status = 'ativo'),
       'pendentes',  (select count(*) from mem where status = 'pendente'),
       'bloqueados', (select count(*) from mem where status = 'bloqueado'),
       'novos',      (select count(*) from mem where created_at >= p_from and created_at < p_to)),
    'residencias', (select count(*) from public.residences where p_org is null or org_id = p_org),
    'dispositivos', jsonb_build_object(
       'total',  (select count(*) from public.devices where p_org is null or org_id = p_org),
       'online', (select count(*) from public.devices
                  where (p_org is null or org_id = p_org) and public.device_online(last_seen_at))),
    'acionamentos', jsonb_build_object(
       'total',    (select count(*) from cmd),
       'sucesso',  (select count(*) from cmd where status = 'sucesso'),
       'falha',    (select count(*) from cmd where status in ('falha','expirado')),
       'chave',    (select count(*) from cmd where source = 'chave_temporaria')),
    'por_dia', (select coalesce(jsonb_agg(jsonb_build_object(
                  'dia', d.dia,
                  'sucesso', (select count(*) from cmd where (cmd.created_at at time zone v_tz)::date = d.dia and cmd.status = 'sucesso'),
                  'falha',   (select count(*) from cmd where (cmd.created_at at time zone v_tz)::date = d.dia and cmd.status in ('falha','expirado'))
                ) order by d.dia), '[]'::jsonb) from dias d),
    'por_portao', (select coalesce(jsonb_agg(x order by (x->>'total')::int desc), '[]'::jsonb) from (
                  select jsonb_build_object('nome', g.name, 'total', count(*),
                           'falha', count(*) filter (where cmd.status in ('falha','expirado'))) x
                  from cmd join public.gates g on g.id = cmd.gate_id
                  group by g.id, g.name order by count(*) desc limit 10) t),
    'por_usuario', (select coalesce(jsonb_agg(x order by (x->>'total')::int desc), '[]'::jsonb) from (
                  select jsonb_build_object('nome', coalesce(p.full_name, p.email, 'Usuário'), 'total', count(*)) x
                  from cmd join public.profiles p on p.id = cmd.requested_by
                  group by p.id, p.full_name, p.email order by count(*) desc limit 10) t)
  ) into v;
  return v;
end $$;
