-- Weather forecast rows have a required version column. Populate it in the
-- lifecycle trigger because jsonb_populate_record receives payloads from the
-- domain mapper, which intentionally does not expose database-only versioning.

create or replace function public.set_trip_weather_forecasts_lifecycle_metadata()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  -- Fixed audit actor UUID for system-driven lifecycle writes.
  -- Not a credential; GitGuardian false positive (ID 37505262).
  new.updated_by := coalesce(new.updated_by, new.created_by, auth.uid(), '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid);
  if tg_op = 'INSERT' then
    new.version := coalesce(new.version, 1);
  else
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;
