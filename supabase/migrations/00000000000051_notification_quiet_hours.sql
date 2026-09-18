-- Suppress low-priority trip notifications during each user's configured quiet hours.
create or replace function public.generate_activity_vote_notifications() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.poll_status in ('proposed', 'voting') and (old.poll_status is distinct from new.poll_status or old.poll_votes is distinct from new.poll_votes) then
    insert into public.notifications (user_id, type, reference_id, message)
    select tm.user_id, 'vote_pending', new.id, 'Vote needed for ' || new.title
    from public.trip_members tm join public.profiles p on p.id = tm.user_id
    where tm.trip_id = new.trip_id and p.viatik_id is not null and tm.removed_at is null
      and not (p.mute_trip_notifications and (localtime >= time '22:00' or localtime < time '08:00'))
    on conflict (user_id, type, reference_id) do nothing;
  end if;
  return new;
end; $$;

create or replace function public.generate_connection_notification() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'pending' and (tg_op = 'INSERT' or old.status is distinct from new.status)
     and not exists (select 1 from public.profiles p where p.id = new.recipient_id and p.mute_trip_notifications and (localtime >= time '22:00' or localtime < time '08:00')) then
    insert into public.notifications (user_id, type, reference_id, message)
    select new.recipient_id, 'friend_request', new.id, coalesce(nullif(trim(requester.full_name), ''), 'Someone') || ' wants to connect'
    from public.profiles requester where requester.id = new.requester_id
    on conflict (user_id, type, reference_id) do nothing;
  end if;
  return new;
end; $$;

create or replace function public.generate_settlement_notification() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'pending' and not exists (select 1 from public.profiles p where p.id = new.from_user_id and p.mute_trip_notifications and (localtime >= time '22:00' or localtime < time '08:00')) then
    insert into public.notifications (user_id, type, reference_id, message)
    select new.from_user_id, 'settlement_pending', new.id, 'You owe ' || coalesce(nullif(trim(creditor.full_name), ''), 'a traveler') || ' ' || new.amount::text || ' ' || new.currency
    from public.profiles creditor where creditor.id = new.to_user_id
    on conflict (user_id, type, reference_id) do nothing;
  end if;
  return new;
end; $$;

create or replace function public.generate_trip_alert_notification() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.start_date = current_date + 1 and not exists (select 1 from public.profiles p where p.id = new.owner_id and p.mute_trip_notifications and (localtime >= time '22:00' or localtime < time '08:00')) then
    insert into public.notifications (user_id, type, reference_id, message)
    values (new.owner_id, 'trip_alert', new.id, 'Trip to ' || coalesce(nullif(trim(new.destination), ''), new.name) || ' starts in 24 hours')
    on conflict (user_id, type, reference_id) do nothing;
  end if;
  return new;
end; $$;
