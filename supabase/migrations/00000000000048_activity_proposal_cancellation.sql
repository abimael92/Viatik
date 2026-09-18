alter table public.activities drop constraint if exists activities_poll_status_chk;
alter table public.activities add constraint activities_poll_status_chk
  check (poll_status in ('confirmed', 'proposed', 'voting', 'approved', 'rejected', 'tie_breaker_needed', 'cancelled'));

create or replace function public.restrict_activity_member_vote_updates()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.poll_status = 'cancelled' and old.created_by <> auth.uid() then
    raise exception 'Only the proposal creator may cancel an activity proposal' using errcode = '42501';
  end if;
  if public.is_trip_editor(old.trip_id) then return new; end if;
  if new.trip_id is distinct from old.trip_id
    or new.day_date is distinct from old.day_date
    or new.title is distinct from old.title
    or new.description is distinct from old.description
    or new.place_name is distinct from old.place_name
    or new.formatted_address is distinct from old.formatted_address
    or new.place_id is distinct from old.place_id
    or new.category is distinct from old.category
    or new.timing_specificity is distinct from old.timing_specificity
    or new.flexible_period is distinct from old.flexible_period
    or new.start_time is distinct from old.start_time
    or new.end_time is distinct from old.end_time
    or new.booking_reference is distinct from old.booking_reference
    or new.participants is distinct from old.participants
    or new.position is distinct from old.position
    or new.estimated_cost is distinct from old.estimated_cost
    or new.deleted_at is distinct from old.deleted_at
  then
    raise exception 'Trip members may only update activity voting fields' using errcode = '42501';
  end if;
  return new;
end;
$$;
