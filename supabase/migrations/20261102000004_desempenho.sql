-- Índices para chaves estrangeiras e auth.uid() avaliado uma vez por consulta nas policies.
create index if not exists audit_logs_actor_id_idx on public.audit_logs (actor_id);
create index if not exists commands_temp_key_id_idx on public.commands (temp_key_id);
create index if not exists devices_driver_id_idx on public.devices (driver_id);
create index if not exists invites_created_by_idx on public.invites (created_by);
create index if not exists organizations_created_by_idx on public.organizations (created_by);
create index if not exists residence_members_approved_by_idx on public.residence_members (approved_by);
create index if not exists temp_keys_created_by_idx on public.temp_keys (created_by);

alter policy profiles_update on public.profiles
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
alter policy oa_select on public.org_admins
  using (user_id = (select auth.uid()) or public.is_org_admin(org_id));
alter policy res_select on public.residences
  using (public.is_org_admin(org_id) or public.is_residence_member(id)
         or exists (select 1 from public.residence_members m
                    where m.residence_id = residences.id and m.user_id = (select auth.uid())));
alter policy rm_select on public.residence_members
  using (user_id = (select auth.uid()) or public.can_manage_residence(residence_id));
alter policy rm_delete on public.residence_members
  using (user_id = (select auth.uid())
         or public.is_org_admin(public.residence_org(residence_id))
         or (role = 'morador' and public.is_residence_titular(residence_id)));
alter policy cmd_select on public.commands
  using (requested_by = (select auth.uid())
         or public.is_org_admin(org_id)
         or (residence_id is not null and public.is_residence_titular(residence_id)));
