-- Checklist items may be soft-archived from Home.
-- Members may only change completed / archived flags — not structure.

create or replace function public.validate_activity_checklist_metadata()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  item jsonb;
begin
  if jsonb_array_length(new.checklist) > 50 then
    raise exception 'Activity checklist may contain at most 50 items' using errcode = '23514';
  end if;

  for item in select value from jsonb_array_elements(new.checklist)
  loop
    if jsonb_typeof(item) <> 'object'
      or nullif(btrim(coalesce(item ->> 'id', '')), '') is null
      or nullif(btrim(coalesce(item ->> 'title', '')), '') is null
      or char_length(btrim(item ->> 'title')) > 160
      or jsonb_typeof(coalesce(item -> 'completed', 'false'::jsonb)) <> 'boolean'
      or (
        item ? 'archived'
        and jsonb_typeof(item -> 'archived') <> 'boolean'
      )
    then
      raise exception 'Invalid activity checklist item' using errcode = '22023';
    end if;
  end loop;

  return new;
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
    or new.participants is distinct from old.participants
    or new.position is distinct from old.position
    or new.estimated_cost is distinct from old.estimated_cost
    or new.deleted_at is distinct from old.deleted_at
  then
    raise exception 'Trip members may only update activity voting fields and checklist progress' using errcode = '42501';
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
      if (old_item ->> 'id') is distinct from (new_item ->> 'id')
        or btrim(coalesce(old_item ->> 'title', '')) is distinct from btrim(coalesce(new_item ->> 'title', ''))
      then
        raise exception 'Trip members may only toggle or skip checklist items' using errcode = '42501';
      end if;
    end loop;
  end if;

  return new;
end;
$$;
