-- Super admin com todas as permissões:
--  * 2FA deixa de ser obrigatória (vale a mesma regra de todos: se ativou, a sessão precisa dela);
--  * pode ver e acionar qualquer portão (ainda exige senha de abertura ou biometria).

create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_super_admin from public.profiles p where p.id = auth.uid()), false)
     and public.mfa_ok();
$$;

-- Lista de portões: super admin vê todos.
create or replace function public.my_gates() returns table (
  gate_id uuid, gate_name text, mode text, state text, state_updated_at timestamptz,
  device_id uuid, device_name text, online boolean, last_seen_at timestamptz,
  org_id uuid, org_name text, residence_id uuid, residence_name text, can_operate boolean)
language sql stable security definer set search_path = '' as $$
  select g.id, g.name, g.mode, g.state, g.state_updated_at,
         d.id, d.name, public.device_online(d.last_seen_at), d.last_seen_at,
         o.id, o.name, ar.residence_id, r.name,
         (ar.residence_id is not null or public.is_org_staff(g.org_id) or public.is_super_admin()) and g.active and d.active
  from public.gates g
  join public.devices d on d.id = g.device_id
  join public.organizations o on o.id = g.org_id
  left join lateral (select public.gate_access_residence(g.id, auth.uid()) as residence_id) ar on true
  left join public.residences r on r.id = ar.residence_id
  where (ar.residence_id is not null or public.is_org_staff(g.org_id) or public.is_super_admin())
  order by o.name, g.name;
$$;

-- Acionar: super admin pode acionar qualquer portão (com a mesma confirmação de todos).
create or replace function public.request_gate_command(p_gate uuid, p_action text, p_pin text default null, p_ticket text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_res uuid;
  v_check text;
begin
  if auth.uid() is null then raise exception 'Não autenticado.'; end if;
  select org_id into v_org from public.gates where id = p_gate;
  if v_org is null then return jsonb_build_object('ok', false, 'erro', 'Portão não encontrado.'); end if;

  v_res := public.gate_access_residence(p_gate, auth.uid());
  if v_res is null and not public.is_org_staff(v_org) and not public.is_super_admin() then
    perform public.log_event(v_org, 'acionamento.negado', 'alerta',
                             jsonb_build_object('portao', p_gate, 'acao', p_action), 'gates', p_gate);
    return jsonb_build_object('ok', false, 'erro', 'Você não tem permissão para acionar este portão.');
  end if;

  if p_ticket is not null then
    if not public.consume_unlock_ticket(auth.uid(), p_ticket) then
      return jsonb_build_object('ok', false, 'confirmacao', 'necessaria', 'erro', 'Confirmação expirada. Tente de novo.');
    end if;
  else
    if not exists (select 1 from public.gate_pins where user_id = auth.uid())
       and not exists (select 1 from public.webauthn_credentials where user_id = auth.uid()) then
      return jsonb_build_object('ok', false, 'confirmacao', 'configurar',
        'erro', 'Crie sua senha de abertura (ou cadastre a digital/rosto) para acionar portões.');
    end if;
    if p_pin is null then
      return jsonb_build_object('ok', false, 'confirmacao', 'necessaria', 'erro', 'Confirme com a digital, o rosto ou a senha de abertura.');
    end if;
    v_check := public.check_gate_pin(auth.uid(), p_pin);
    if v_check = 'bloqueado' then
      return jsonb_build_object('ok', false, 'confirmacao', 'bloqueada',
        'erro', 'Senha de abertura bloqueada por 15 minutos após várias tentativas erradas.');
    elsif v_check = 'sem_pin' then
      return jsonb_build_object('ok', false, 'confirmacao', 'necessaria', 'erro', 'Use a digital ou o rosto para confirmar.');
    elsif v_check <> 'ok' then
      perform public.log_event(v_org, 'acionamento.senha_errada', 'alerta',
                               jsonb_build_object('portao', p_gate), 'gates', p_gate);
      return jsonb_build_object('ok', false, 'confirmacao', 'necessaria', 'erro', 'Senha de abertura incorreta.');
    end if;
  end if;

  -- Acionamento feito pelo super admin fora das próprias residências fica destacado na auditoria.
  if v_res is null and not public.is_org_staff(v_org) then
    perform public.log_event(v_org, 'acionamento.super_admin', 'alerta',
                             jsonb_build_object('portao', p_gate, 'acao', p_action), 'gates', p_gate);
  end if;

  return public.enqueue_command(p_gate, p_action, auth.uid(), v_res, 'app', null);
end $$;
