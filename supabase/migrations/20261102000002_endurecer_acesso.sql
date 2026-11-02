-- gate_access_residence só responde sobre o próprio usuário logado.
create or replace function public.gate_access_residence(p_gate uuid, p_user uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select m.residence_id
  from public.gate_residences gr
  join public.residence_members m on m.residence_id = gr.residence_id
  where gr.gate_id = p_gate and m.user_id = p_user and p_user = auth.uid() and m.status = 'ativo'
    and (m.allowed_gates is null or p_gate = any (m.allowed_gates))
  order by (m.role = 'titular') desc
  limit 1;
$$;
