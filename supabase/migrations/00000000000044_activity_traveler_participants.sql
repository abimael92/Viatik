create or replace function public.validate_activity_participants()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if exists (
    select 1
    from jsonb_array_elements(new.participants) participant
    where jsonb_typeof(participant) <> 'object'
      or not (participant ? 'status')
      or participant ->> 'status' not in ('attending', 'declined', 'pending')
      or (
        nullif(participant ->> 'userId', '') is null
        and nullif(participant ->> 'travelerId', '') is null
      )
  ) then
    raise exception 'Invalid activity participant payload' using errcode = '22023';
  end if;
  return new;
end;
$$;