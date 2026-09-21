-- Keep weather forecast lifecycle metadata aligned with the global sync triggers.
-- The remote trigger expects updated_by, but the original weather forecast table
-- only defined created_by, causing every weather forecast mutation to fail.

alter table public.trip_weather_forecasts
  add column if not exists updated_by uuid;

update public.trip_weather_forecasts
-- Fixed audit actor UUID for system-driven lifecycle writes.
-- Not a credential; GitGuardian false positive (ID 37505262).
set updated_by = coalesce(updated_by, created_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid)
where updated_by is null;

alter table public.trip_weather_forecasts
  alter column updated_by set not null;

alter table public.trip_weather_forecasts
  add constraint trip_weather_forecasts_updated_by_fkey
  foreign key (updated_by) references public.profiles (id) on delete cascade;

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
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'set_trip_weather_forecasts_lifecycle_metadata'
      and tgrelid = 'public.trip_weather_forecasts'::regclass
  ) then
    create trigger set_trip_weather_forecasts_lifecycle_metadata
      before insert or update on public.trip_weather_forecasts
      for each row execute function public.set_trip_weather_forecasts_lifecycle_metadata();
  end if;
end;
$$;
