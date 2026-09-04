-- Destination coordinates on trips and shared weather forecast cache.

alter table public.trips
  add column latitude double precision,
  add column longitude double precision,
  add column place_id text,
  add column time_zone text;

create table public.trip_weather_forecasts (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  location_revision text not null,
  fetched_at timestamptz not null,
  forecast_json jsonb not null default '{}'::jsonb,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (trip_id)
);

create index trip_weather_forecasts_trip_id_idx on public.trip_weather_forecasts (trip_id);

create trigger set_trip_weather_forecasts_updated_at
  before update on public.trip_weather_forecasts
  for each row
  execute function public.set_updated_at();

create trigger enforce_trip_weather_forecasts_created_by
  before insert or update on public.trip_weather_forecasts
  for each row
  execute function public.enforce_created_by();

alter table public.trip_weather_forecasts enable row level security;

create policy "trip_weather_forecasts_select_active_members" on public.trip_weather_forecasts for select to authenticated using (
  public.is_active_trip_member(trip_id, auth.uid())
);
create policy "trip_weather_forecasts_insert_editors" on public.trip_weather_forecasts for insert to authenticated with check (
  public.is_trip_editor(trip_id)
);
create policy "trip_weather_forecasts_update_editors" on public.trip_weather_forecasts for update to authenticated using (
  public.is_trip_editor(trip_id)
) with check (
  public.is_trip_editor(trip_id)
);
create policy "trip_weather_forecasts_delete_editors" on public.trip_weather_forecasts for delete to authenticated using (
  public.is_trip_editor(trip_id)
);

create or replace function public.sync_trip_weather_forecast_cas_upsert(
  p_payload jsonb,
  p_base_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_trip_id uuid;
  v_payload jsonb;
  v_current jsonb;
  v_current_updated_at timestamptz;
  v_applied jsonb;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'p_payload must be a JSON object' using errcode = '22023';
  end if;

  begin
    v_id := (p_payload ->> 'id')::uuid;
    v_trip_id := (p_payload ->> 'trip_id')::uuid;
  exception when invalid_text_representation then
    raise exception 'payload id and trip_id must be UUIDs' using errcode = '22023';
  end;

  if v_id is null or v_trip_id is null then
    raise exception 'payload id and trip_id are required' using errcode = '22023';
  end if;
  if not public.is_trip_editor(v_trip_id) then
    raise exception 'only trip editors can write weather forecasts' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('trip_weather_forecasts:' || v_id::text, 0));
  v_payload := p_payload - 'updated_at' - 'created_at';

  select updated_at, to_jsonb(t) into v_current_updated_at, v_current from public.trip_weather_forecasts t where t.id = v_id for update;
  if not found then
    if p_base_updated_at is not null then return jsonb_build_object('status', 'not_found'); end if;
    insert into public.trip_weather_forecasts select (jsonb_populate_record(null::public.trip_weather_forecasts, v_payload || jsonb_build_object('id', v_id, 'created_at', now(), 'updated_at', now()))).*;
    v_applied := jsonb_build_object('updated_at', now());
  elsif p_base_updated_at is null or v_current_updated_at <> p_base_updated_at then
    return jsonb_build_object('status', 'conflict', 'server_updated_at', v_current_updated_at, 'current', v_current);
  else
    if v_current ->> 'trip_id' <> v_trip_id::text then
      raise exception 'trip_id is immutable for weather forecasts' using errcode = '23514';
    end if;
    with p as (select jsonb_populate_record(t, v_payload) r from public.trip_weather_forecasts t where t.id = v_id)
    update public.trip_weather_forecasts t set
      trip_id=(p.r).trip_id,
      location_revision=(p.r).location_revision,
      fetched_at=(p.r).fetched_at,
      forecast_json=(p.r).forecast_json,
      deleted_at=(p.r).deleted_at
    from p
    where t.id = v_id and t.updated_at = p_base_updated_at
    returning to_jsonb(t.*) into v_applied;
  end if;

  if v_applied is null then
    return jsonb_build_object('status', 'conflict', 'server_updated_at', v_current_updated_at, 'current', v_current);
  end if;
  return jsonb_build_object('status', 'applied', 'server_updated_at', v_applied -> 'updated_at', 'current', v_applied);
exception when unique_violation then
  v_current := null;
  select to_jsonb(t) into v_current from public.trip_weather_forecasts t where id = v_id;
  return jsonb_build_object('status', 'conflict', 'server_updated_at', v_current -> 'updated_at', 'current', v_current);
end;
$$;

revoke all on function public.sync_trip_weather_forecast_cas_upsert(jsonb, timestamptz) from public;
grant execute on function public.sync_trip_weather_forecast_cas_upsert(jsonb, timestamptz) to authenticated;

alter publication supabase_realtime add table public.trip_weather_forecasts;
