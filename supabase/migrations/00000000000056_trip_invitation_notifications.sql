-- Notify existing Viatik accounts when they are invited to a trip.
-- Invitations sent to unregistered email addresses remain email-based and do
-- not create an in-app notification until the account is known.

alter type public.notification_type add value if not exists 'trip_invitation';

create or replace function public.generate_trip_invitation_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient_id uuid;
  trip_name text;
begin
  if new.status <> 'pending' then
    return new;
  end if;

  select u.id
  into recipient_id
  from auth.users u
  where lower(u.email) = lower(new.email)
  limit 1;

  if recipient_id is null then
    return new;
  end if;

  select name into trip_name from public.trips where id = new.trip_id;

  insert into public.notifications (user_id, type, reference_id, message)
  values (
    recipient_id,
    'trip_invitation',
    new.id,
    'You were invited to ' || coalesce(nullif(trim(trip_name), ''), 'a trip')
  )
  on conflict (user_id, type, reference_id) do nothing;

  return new;
end;
$$;

create or replace trigger trip_invitations_generate_notification
after insert or update of email, status on public.trip_invitations
for each row execute function public.generate_trip_invitation_notification();
