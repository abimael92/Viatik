-- Viewers may change only their own activity attendance.
-- A direct member insert can queue a trip_added notification for that person.

alter type public.notification_type add value if not exists 'trip_added';

create or replace function public.activity_participants_rsvp_only(
  old_participants jsonb,
  new_participants jsonb,
  actor uuid
) returns boolean
language plpgsql
immutable
as $$
declare
  old_item jsonb;
  new_item jsonb;
  old_self jsonb := null;
  new_self jsonb := null;
  old_others jsonb := '[]'::jsonb;
  new_others jsonb := '[]'::jsonb;
begin
  if actor is null then return false; end if;
  for old_item in select value from jsonb_array_elements(coalesce(old_participants, '[]'::jsonb))
  loop
    if old_item->>'userId' = actor::text then
      if old_self is not null then return false; end if;
      old_self := old_item;
    else
      old_others := old_others || jsonb_build_array(old_item);
    end if;
  end loop;
  for new_item in select value from jsonb_array_elements(coalesce(new_participants, '[]'::jsonb))
  loop
    if new_item->>'userId' = actor::text then
      if new_self is not null then return false; end if;
      new_self := new_item;
    else
      new_others := new_others || jsonb_build_array(new_item);
    end if;
  end loop;
  if old_others is distinct from new_others then return false; end if;
  if new_self is null then return false; end if;
  if new_self->>'status' not in ('attending', 'declined') then return false; end if;
  if old_self is not null and (old_self - 'status') is distinct from (new_self - 'status') then
    return false;
  end if;
  return true;
end;
$$;

create or replace function public.restrict_activity_member_vote_updates()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  old_item jsonb;
  new_item jsonb;
  index integer;
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
    or new.attachments is distinct from old.attachments
    or new.position is distinct from old.position
    or new.estimated_cost is distinct from old.estimated_cost
    or new.deleted_at is distinct from old.deleted_at
  then
    raise exception 'Trip members may only update activity voting fields, checklist progress, and their own attendance' using errcode = '42501';
  end if;

  if new.participants is distinct from old.participants
    and not public.activity_participants_rsvp_only(old.participants, new.participants, auth.uid())
  then
    raise exception 'Trip members may only change their own attendance' using errcode = '42501';
  end if;

  if new.checklist is distinct from old.checklist then
    if jsonb_array_length(coalesce(new.checklist, '[]'::jsonb))
         <> jsonb_array_length(coalesce(old.checklist, '[]'::jsonb))
    then
      raise exception 'Trip members may only toggle or skip checklist items' using errcode = '42501';
    end if;

    for index in 0 .. greatest(jsonb_array_length(coalesce(old.checklist, '[]'::jsonb)) - 1, -1)
    loop
      old_item := old.checklist -> index;
      new_item := new.checklist -> index;
      if (old_item - 'completed' - 'archived') is distinct from
         (new_item - 'completed' - 'archived')
      then
        raise exception 'Trip members may only toggle or skip checklist items' using errcode = '42501';
      end if;
    end loop;
  end if;

  return new;
end;
$$;

create or replace function public.sync_trip_added_notification(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_user uuid;
  v_trip uuid;
  v_message text;
  v_row public.notifications;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'p_payload must be a JSON object' using errcode = '22023';
  end if;
  if p_payload->>'type' is distinct from 'trip_added' then
    raise exception 'Only trip_added notifications can be queued by a collaborator' using errcode = '42501';
  end if;
  v_id := (p_payload->>'id')::uuid;
  v_user := (p_payload->>'user_id')::uuid;
  v_trip := (p_payload->>'reference_id')::uuid;
  v_message := btrim(coalesce(p_payload->>'message', ''));
  if v_id is null or v_user is null or v_trip is null or v_message = '' then
    raise exception 'Invalid trip added notification' using errcode = '22023';
  end if;
  if v_user = auth.uid() then
    raise exception 'Cannot notify yourself of a trip add' using errcode = '42501';
  end if;
  if not public.is_trip_editor(v_trip) then
    raise exception 'Only trip editors can notify a new member' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.trip_members tm
    where tm.trip_id = v_trip and tm.user_id = v_user and tm.removed_at is null
  ) then
    raise exception 'Notification recipient is not a member of this trip' using errcode = '42501';
  end if;

  insert into public.notifications (id, user_id, type, reference_id, is_read, message)
  values (v_id, v_user, 'trip_added', v_trip, false, v_message)
  on conflict (user_id, type, reference_id) do nothing;

  select * into v_row
  from public.notifications
  where user_id = v_user and type = 'trip_added' and reference_id = v_trip;

  return jsonb_build_object('status', 'applied', 'server_updated_at', v_row.updated_at);
end;
$$;

revoke all on function public.sync_trip_added_notification(jsonb) from public;
grant execute on function public.sync_trip_added_notification(jsonb) to authenticated;
