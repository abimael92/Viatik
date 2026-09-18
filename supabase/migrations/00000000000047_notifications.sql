-- Strictly additive Notification Center schema. Level B metadata is included.
create type public.notification_type as enum ('vote_pending', 'friend_request', 'settlement_pending', 'trip_alert');

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type public.notification_type not null,
  reference_id uuid not null,
  is_read boolean not null default false,
  message text not null check (char_length(trim(message)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0),
  unique (user_id, type, reference_id)
);

-- Existing activity voting rows need to accept the additive tie-breaker state.
alter table public.activities drop constraint if exists activities_poll_status_chk;
alter table public.activities add constraint activities_poll_status_chk check (poll_status in ('confirmed', 'proposed', 'voting', 'approved', 'rejected', 'tie_breaker_needed'));

create index notifications_user_unread_idx on public.notifications (user_id, is_read, updated_at desc);
alter table public.notifications enable row level security;
create policy "notifications_select_owner" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "notifications_update_owner" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notifications_insert_owner" on public.notifications for insert to authenticated with check (user_id = auth.uid());

create or replace function public.touch_notification_updated_at() returns trigger language plpgsql set search_path = public as $$ begin new.updated_at = now(); new.version = old.version + 1; return new; end; $$;
create trigger notifications_touch_updated_at before update on public.notifications for each row execute function public.touch_notification_updated_at();

create or replace function public.generate_activity_vote_notifications() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.poll_status in ('proposed', 'voting') and (old.poll_status is distinct from new.poll_status or old.poll_votes is distinct from new.poll_votes) then
    insert into public.notifications (user_id, type, reference_id, message)
    select tm.user_id, 'vote_pending', new.id, 'Vote needed for ' || new.title
    from public.trip_members tm join public.profiles p on p.id = tm.user_id
    where tm.trip_id = new.trip_id and p.viatik_id is not null and tm.removed_at is null
    on conflict (user_id, type, reference_id) do nothing;
  end if;
  return new;
end; $$;
create trigger activities_generate_vote_notifications after insert or update of poll_status, poll_votes on public.activities for each row execute function public.generate_activity_vote_notifications();

create or replace function public.generate_connection_notification() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'pending' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    insert into public.notifications (user_id, type, reference_id, message) select new.recipient_id, 'friend_request', new.id, coalesce(nullif(trim(requester.full_name), ''), 'Someone') || ' wants to connect' from public.profiles requester where requester.id = new.requester_id on conflict (user_id, type, reference_id) do nothing;
  end if;
  return new;
end; $$;
create trigger connections_generate_notification after insert or update of status on public.connections for each row execute function public.generate_connection_notification();

create or replace function public.generate_settlement_notification() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'pending' then
    insert into public.notifications (user_id, type, reference_id, message) select new.from_user_id, 'settlement_pending', new.id, 'You owe ' || coalesce(nullif(trim(creditor.full_name), ''), 'a traveler') || ' ' || new.amount::text || ' ' || new.currency from public.profiles creditor where creditor.id = new.to_user_id on conflict (user_id, type, reference_id) do nothing;
  end if;
  return new;
end; $$;
create trigger settlements_generate_notification after insert on public.expense_settlements for each row execute function public.generate_settlement_notification();

create or replace function public.generate_trip_alert_notification() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.start_date = current_date + 1 then
    insert into public.notifications (user_id, type, reference_id, message) values (new.owner_id, 'trip_alert', new.id, 'Trip to ' || coalesce(nullif(trim(new.destination), ''), new.name) || ' starts in 24 hours') on conflict (user_id, type, reference_id) do nothing;
  end if;
  return new;
end; $$;
create trigger trips_generate_alert_notification after insert or update of start_date on public.trips for each row execute function public.generate_trip_alert_notification();
