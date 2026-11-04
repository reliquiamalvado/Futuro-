-- Esqueci a senha de abertura, mas tenho digital/rosto/Face ID cadastrado: a biometria confirma
-- que sou eu e eu crio uma nova senha, sem gastar a chance de recuperação.
create function public.set_gate_pin_biometric(p_new text, p_ticket text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Não autenticado.'; end if;
  if p_new is null or p_new !~ '^\d{4,8}$' then
    return jsonb_build_object('ok', false, 'erro', 'A senha de abertura deve ter de 4 a 8 números.');
  end if;
  if public.pin_is_weak(p_new) then
    return jsonb_build_object('ok', false, 'erro', 'Senha muito fácil (sequência ou números repetidos). Escolha outra.');
  end if;
  if not public.consume_unlock_ticket(auth.uid(), p_ticket) then
    return jsonb_build_object('ok', false, 'erro', 'Confirmação expirada. Confirme a biometria de novo.');
  end if;
  insert into public.gate_pins (user_id, pin_hash, updated_at)
  values (auth.uid(), extensions.crypt(p_new, extensions.gen_salt('bf', 10)), now())
  on conflict (user_id) do update set pin_hash = excluded.pin_hash, failed = 0, locked_until = null, updated_at = now();
  insert into public.audit_logs (actor_id, action, entity, entity_id, severity, details)
  values (auth.uid(), 'abertura.senha_recuperada_biometria', 'profiles', auth.uid(), 'alerta', '{}'::jsonb);
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.set_gate_pin_biometric(text, text) from public, anon;
grant execute on function public.set_gate_pin_biometric(text, text) to authenticated;
