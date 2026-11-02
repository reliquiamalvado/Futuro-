-- Privacidade (LGPD): cada pessoa vê a própria atividade, baixa os próprios dados e pode excluir a conta.

-- Minha atividade: o que aconteceu na MINHA conta (sem dados de outras pessoas).
create function public.my_activity(p_limit integer default 50)
returns table (created_at timestamptz, action text, severity text, local text)
language sql stable security definer set search_path = '' as $$
  select a.created_at, a.action, a.severity, o.name
    from public.audit_logs a left join public.organizations o on o.id = a.org_id
   where auth.uid() is not null
     and (a.actor_id = auth.uid() or (a.entity = 'profiles' and a.entity_id = auth.uid()))
   order by a.created_at desc
   limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

-- Meus dados: tudo o que o AuggeControl guarda sobre mim, num arquivo só (sem senhas nem hashes).
create function public.export_my_data() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Não autenticado.'; end if;
  return jsonb_build_object(
    'gerado_em', now(),
    'aviso', 'Arquivo com os seus dados pessoais guardados pelo AuggeControl (LGPD, art. 18). Senhas e chaves secretas nunca são exportadas: só guardamos uma versão embaralhada (hash) delas.',
    'perfil', (select jsonb_build_object('nome', p.full_name, 'email', p.email, 'telefone', p.phone,
                 'tipo_de_conta', p.account_type, 'criado_em', p.created_at)
                 from public.profiles p where p.id = v_uid),
    'residencias', coalesce((select jsonb_agg(jsonb_build_object('residencia', r.name, 'local', o.name,
                 'papel', m.role, 'situacao', m.status, 'desde', m.created_at) order by m.created_at)
                 from public.residence_members m join public.residences r on r.id = m.residence_id
                 join public.organizations o on o.id = r.org_id where m.user_id = v_uid), '[]'::jsonb),
    'administra', coalesce((select jsonb_agg(jsonb_build_object('local', o.name, 'desde', a.created_at))
                 from public.org_admins a join public.organizations o on o.id = a.org_id where a.user_id = v_uid), '[]'::jsonb),
    'seguranca_para_abrir', jsonb_build_object(
                 'senha_de_abertura_definida', exists (select 1 from public.gate_pins where user_id = v_uid),
                 'biometrias', coalesce((select jsonb_agg(jsonb_build_object('aparelho', c.device_name,
                   'cadastrada_em', c.created_at, 'ultimo_uso', c.last_used_at))
                   from public.webauthn_credentials c where c.user_id = v_uid), '[]'::jsonb)),
    'acionamentos', coalesce((select jsonb_agg(jsonb_build_object('quando', c.created_at, 'portao', g.name,
                 'acao', c.action, 'resultado', c.status) order by c.created_at desc)
                 from (select * from public.commands where requested_by = v_uid order by created_at desc limit 2000) c
                 left join public.gates g on g.id = c.gate_id), '[]'::jsonb),
    'chaves_temporarias_criadas', coalesce((select jsonb_agg(jsonb_build_object('nome', k.label,
                 'valida_de', k.valid_from, 'valida_ate', k.valid_until, 'usos', k.uses, 'revogada', k.revoked_at))
                 from public.temp_keys k where k.created_by = v_uid), '[]'::jsonb),
    'atividade_da_conta', coalesce((select jsonb_agg(to_jsonb(x)) from public.my_activity(200) x), '[]'::jsonb)
  );
end $$;

-- Pode excluir a conta? Não deixa um condomínio/casa sem administrador.
create function public.account_deletion_check() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case
    when auth.uid() is null then jsonb_build_object('ok', false, 'erro', 'Não autenticado.')
    when exists (select 1 from public.profiles where id = auth.uid() and is_super_admin)
      then jsonb_build_object('ok', false, 'erro', 'Super admins não podem excluir a conta por aqui. Primeiro passe o acesso para outra pessoa.')
    when exists (
      select 1 from public.org_admins a
       where a.user_id = auth.uid()
         and not exists (select 1 from public.org_admins b where b.org_id = a.org_id and b.user_id <> auth.uid())
         and (exists (select 1 from public.residence_members m join public.residences r on r.id = m.residence_id
                       where r.org_id = a.org_id and m.user_id <> auth.uid())))
      then jsonb_build_object('ok', false, 'erro', 'Você é o único administrador de um local com outros moradores. Adicione outro administrador antes de excluir a conta.')
    else jsonb_build_object('ok', true)
  end;
$$;

revoke execute on function public.my_activity(integer), public.export_my_data(), public.account_deletion_check() from public, anon;
grant execute on function public.my_activity(integer), public.export_my_data(), public.account_deletion_check() to authenticated;
