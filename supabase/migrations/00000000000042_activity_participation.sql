alter table public.activities
  add column if not exists participants jsonb not null default '[]'::jsonb;

alter table public.activities
  add constraint activities_participants_array_chk
    check (jsonb_typeof(participants) = 'array');

create index if not exists activities_participants_gin_idx
  on public.activities using gin (participants);

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
      or not (participant ? 'userId')
      or not (participant ? 'status')
      or participant ->> 'status' not in ('attending', 'declined', 'pending')
  ) then
    raise exception 'Invalid activity participant payload' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger validate_activity_participants
  before insert or update of participants on public.activities
  for each row execute function public.validate_activity_participants();

create or replace function public.sync_activity_cas_upsert(
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
  v_payload jsonb;
  v_current jsonb;
  v_current_updated_at timestamptz;
  v_applied jsonb;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'p_payload must be a JSON object' using errcode = '22023'; end if;
  v_id := (p_payload ->> 'id')::uuid;
  if v_id is null then raise exception 'p_payload.id is required' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('activities:' || v_id::text, 0));
  v_payload := p_payload - 'updated_at' - 'created_at';
  select updated_at, to_jsonb(activities.*) into v_current_updated_at, v_current from public.activities where id = v_id for update;
  if not found then
    if p_base_updated_at is not null then return jsonb_build_object('status', 'not_found'); end if;
    insert into public.activities select (jsonb_populate_record(null::public.activities, v_payload || jsonb_build_object('id', v_id, 'created_at', now(), 'updated_at', now()))).*;
    select to_jsonb(activities.*) into v_applied from public.activities where id = v_id;
  elsif p_base_updated_at is null or v_current_updated_at <> p_base_updated_at then
    return jsonb_build_object('status', 'conflict', 'server_updated_at', v_current_updated_at, 'current', v_current);
  else
    with payload as (select jsonb_populate_record(activities, v_payload) row from public.activities where id = v_id)
    update public.activities target set trip_id=(payload.row).trip_id, day_date=(payload.row).day_date, title=(payload.row).title, description=(payload.row).description, place_name=(payload.row).place_name, formatted_address=(payload.row).formatted_address, place_id=(payload.row).place_id, category=(payload.row).category, timing_specificity=(payload.row).timing_specificity, flexible_period=(payload.row).flexible_period, start_time=(payload.row).start_time, end_time=(payload.row).end_time, booking_reference=(payload.row).booking_reference, participants=(payload.row).participants, position=(payload.row).position, estimated_cost=(payload.row).estimated_cost, updated_by=(payload.row).updated_by, deleted_by=(payload.row).deleted_by, deleted_at=(payload.row).deleted_at
    from payload where target.id = v_id and target.updated_at = p_base_updated_at returning to_jsonb(target.*) into v_applied;
  end if;
  if v_applied is null then return jsonb_build_object('status', 'conflict'); end if;
  return jsonb_build_object('status', 'applied', 'server_updated_at', v_applied ->> 'updated_at', 'current', v_applied);
end;
$$;