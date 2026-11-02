-- Notificações para o dono da plataforma (WhatsApp) a cada novo cadastro.
create extension if not exists pg_net with schema extensions;

create table public.admin_notifications (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,
  message     text not null,
  payload     jsonb not null default '{}'::jsonb,
  status      text not null default 'pendente' check (status in ('pendente','enviada','falha','sem_canal')),
  channel     text,
  error       text,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);
create index on public.admin_notifications (created_at desc);

alter table public.admin_notifications enable row level security;
create policy an_select on public.admin_notifications for select to authenticated
  using (public.is_super_admin());
revoke insert, update, delete on public.admin_notifications from authenticated;
revoke all on public.admin_notifications from anon;

-- Dispara a Edge Function que entrega a notificação.
create function public.dispatch_admin_notification() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform net.http_post(
    url := 'https://miqjabshccauhvzcqzle.supabase.co/functions/v1/notify-admin',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('id', new.id)
  );
  return null;
end $$;

create trigger dispatch_admin_notification after insert on public.admin_notifications
for each row execute function public.dispatch_admin_notification();

-- Novo cadastro -> notificação.
create function public.notify_new_signup() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_provider text;
  v_total bigint;
begin
  select coalesce(u.raw_app_meta_data->>'provider', 'email') into v_provider
    from auth.users u where u.id = new.id;
  select count(*) into v_total from public.profiles;

  insert into public.admin_notifications (kind, message, payload)
  values ('novo_cadastro',
          '🔔 AuggeControl: novo cadastro' || chr(10) ||
          'Nome: ' || coalesce(nullif(new.full_name, ''), '(não informado)') || chr(10) ||
          'E-mail: ' || coalesce(new.email, '—') || chr(10) ||
          'Entrou com: ' || case v_provider when 'google' then 'Google' else 'E-mail e senha' end || chr(10) ||
          'Total de usuários: ' || v_total,
          jsonb_build_object('user_id', new.id, 'email', new.email, 'provider', v_provider));
  return null;
end $$;

create trigger notify_new_signup after insert on public.profiles
for each row execute function public.notify_new_signup();

revoke execute on function public.dispatch_admin_notification() from public, anon, authenticated;
revoke execute on function public.notify_new_signup() from public, anon, authenticated;
