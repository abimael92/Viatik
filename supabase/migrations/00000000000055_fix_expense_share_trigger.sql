-- Allow expense shares to target either an authenticated trip member or a
-- trip-scoped manual traveler. This replaces only the validation function and
-- trigger behavior; no table or data is dropped.

CREATE OR REPLACE FUNCTION public.validate_expense_share_membership()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
declare
  parent_trip_id uuid;
  valid_traveler boolean;
begin
  select trip_id into parent_trip_id
  from public.expenses where id = new.expense_id;

  if parent_trip_id is null then
    raise exception 'Expense does not exist' using errcode = '23503';
  end if;

  if new.user_id is not null then
    if not public.is_active_trip_member(parent_trip_id, new.user_id) then
      raise exception 'Expense share user must be an active trip member' using errcode = '23514';
    end if;
  elsif new.traveler_id is not null then
    select exists (
      select 1 from public.trip_travelers
      where id = new.traveler_id and trip_id = parent_trip_id
    ) into valid_traveler;

    if not valid_traveler then
      raise exception 'Expense share traveler must belong to the trip' using errcode = '23514';
    end if;
  else
    raise exception 'Expense share must have either a user_id or a traveler_id' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and (
    new.expense_id is distinct from old.expense_id or
    new.user_id is distinct from old.user_id or
    new.traveler_id is distinct from old.traveler_id
  ) then
    raise exception 'Expense share identity is immutable' using errcode = '23514';
  end if;

  return new;
end;
$$;
