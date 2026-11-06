-- Encontrado no teste de ataque: o dono de uma casa conseguia transformar a casa em "condomínio"
-- (e assim passar do limite de 3 casas e virar condomínio sem aprovação).
-- Agora só o super admin muda tipo, dono, identificador e data de criação de um cliente.
create or replace function public.guard_org_active() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.is_super_admin() then return new; end if;
  if new.active is distinct from old.active then
    raise exception 'Apenas o super admin pode ativar ou desativar clientes.';
  end if;
  if new.kind is distinct from old.kind then
    raise exception 'Apenas o super admin pode mudar o tipo do cliente (casa, condomínio ou empresa).';
  end if;
  if new.id is distinct from old.id or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Estes dados do cliente não podem ser alterados.';
  end if;
  return new;
end $$;

-- Residências: o identificador e a data de criação não mudam.
create or replace function public.guard_residence_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
    raise exception 'Estes dados da residência não podem ser alterados.';
  end if;
  return new;
end $$;
drop trigger if exists guard_residence_update on public.residences;
create trigger guard_residence_update before update on public.residences
for each row execute function public.guard_residence_update();

revoke execute on function public.guard_residence_update() from public, anon, authenticated;
