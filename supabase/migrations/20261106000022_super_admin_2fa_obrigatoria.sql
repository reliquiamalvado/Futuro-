-- Conta do dono da plataforma (super admin) mais protegida:
-- os poderes de super admin só valem numa sessão confirmada com o código do celular (aal2).
-- Para todos os outros usuários a verificação em duas etapas continua opcional.
create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_super_admin from public.profiles p where p.id = auth.uid()), false)
     and coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2';
$$;

-- Quem perdeu o celular com o autenticador: o administrador libera a 2FA para a pessoa cadastrar de novo.
--  * ninguém libera a própria;
--  * a 2FA do super admin não pode ser removida pelo app;
--  * a 2FA de um administrador só o super admin libera.
create or replace function public.admin_reset_mfa(p_user uuid, p_org uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Não autenticado.'; end if;
  if p_user = auth.uid() then
    return jsonb_build_object('ok', false, 'erro', 'Você não pode liberar a sua própria verificação. Peça a outro administrador.');
  end if;
  if not public.is_org_admin(p_org) then raise exception 'Sem permissão.'; end if;
  if coalesce((select is_super_admin from public.profiles where id = p_user), false) then
    return jsonb_build_object('ok', false, 'erro', 'A verificação do dono da plataforma não pode ser removida pelo app.');
  end if;
  if exists (select 1 from public.org_admins a where a.user_id = p_user and a.org_id = p_org) then
    if not public.is_super_admin() then
      return jsonb_build_object('ok', false, 'erro', 'Só o dono da plataforma libera a verificação de um administrador.');
    end if;
  elsif not exists (select 1 from public.residence_members m join public.residences r on r.id = m.residence_id
                     where m.user_id = p_user and r.org_id = p_org) then
    raise exception 'Sem permissão.';
  end if;
  if not exists (select 1 from auth.mfa_factors where user_id = p_user) then
    return jsonb_build_object('ok', false, 'erro', 'Esta pessoa não usa verificação em duas etapas.');
  end if;
  delete from auth.mfa_factors where user_id = p_user;
  insert into public.audit_logs (org_id, actor_id, action, entity, entity_id, severity, details)
  values (p_org, auth.uid(), 'conta.2fa_liberada_admin', 'profiles', p_user, 'critico', '{}'::jsonb);
  return jsonb_build_object('ok', true);
end $$;

-- Para a tela de moradores: quem usa 2FA (sem expor nada do fator).
create or replace function public.org_mfa_status(p_org uuid) returns table (user_id uuid)
language sql stable security definer set search_path = '' as $$
  select distinct f.user_id
    from auth.mfa_factors f
   where f.status = 'verified'
     and public.is_org_admin(p_org)
     and (f.user_id in (select m.user_id from public.residence_members m join public.residences r on r.id = m.residence_id where r.org_id = p_org)
          or f.user_id in (select a.user_id from public.org_admins a where a.org_id = p_org));
$$;

revoke execute on function public.admin_reset_mfa(uuid, uuid), public.org_mfa_status(uuid) from public, anon;
grant execute on function public.admin_reset_mfa(uuid, uuid), public.org_mfa_status(uuid) to authenticated;
