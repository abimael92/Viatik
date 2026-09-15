alter table public.activities
  add column if not exists poll_status text not null default 'confirmed',
  add column if not exists voting_ends_at timestamptz,
  add column if not exists poll_options jsonb not null default '[]'::jsonb,
  add column if not exists poll_votes jsonb not null default '[]'::jsonb;

alter table public.activities
  add constraint activities_poll_status_chk
    check (poll_status in ('confirmed', 'proposed', 'voting', 'approved', 'rejected')),
  add constraint activities_poll_options_array_chk
    check (jsonb_typeof(poll_options) = 'array'),
  add constraint activities_poll_votes_array_chk
    check (jsonb_typeof(poll_votes) = 'array');

create index if not exists activities_poll_status_idx
  on public.activities (trip_id, poll_status)
  where poll_status in ('proposed', 'voting');

create or replace function public.validate_activity_poll_metadata()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.poll_status in ('proposed', 'voting') and jsonb_array_length(new.poll_options) = 0 then
    raise exception 'Active activity voting requires at least one option' using errcode = '23514';
  end if;
  if exists (
    select 1 from jsonb_array_elements(new.poll_votes) vote
    where jsonb_typeof(vote) <> 'object'
      or nullif(vote ->> 'userId', '') is null
      or vote ->> 'choice' not in ('approve', 'decline', 'suggested')
  ) then
    raise exception 'Invalid activity vote payload' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger validate_activity_poll_metadata
  before insert or update of poll_status, poll_options, poll_votes on public.activities
  for each row execute function public.validate_activity_poll_metadata();

create policy "activities_vote_members"
  on public.activities for update to authenticated
  using (public.is_trip_member(trip_id))
  with check (public.is_trip_member(trip_id));

create or replace function public.restrict_activity_member_vote_updates()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
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

create trigger restrict_activity_member_vote_updates
  before update on public.activities
  for each row execute function public.restrict_activity_member_vote_updates();

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
    update public.activities target set
      trip_id=(payload.row).trip_id, day_date=(payload.row).day_date, title=(payload.row).title,
      description=(payload.row).description, place_name=(payload.row).place_name,
      formatted_address=(payload.row).formatted_address, place_id=(payload.row).place_id,
      category=(payload.row).category, timing_specificity=(payload.row).timing_specificity,
      flexible_period=(payload.row).flexible_period, start_time=(payload.row).start_time,
      end_time=(payload.row).end_time, booking_reference=(payload.row).booking_reference,
      participants=(payload.row).participants, poll_status=(payload.row).poll_status,
      voting_ends_at=(payload.row).voting_ends_at, poll_options=(payload.row).poll_options,
      poll_votes=(payload.row).poll_votes, position=(payload.row).position,
      estimated_cost=(payload.row).estimated_cost, updated_by=(payload.row).updated_by,
      deleted_by=(payload.row).deleted_by, deleted_at=(payload.row).deleted_at
    from payload where target.id = v_id and target.updated_at = p_base_updated_at
    returning to_jsonb(target.*) into v_applied;
  end if;
  if v_applied is null then return jsonb_build_object('status', 'conflict'); end if;
  return jsonb_build_object('status', 'applied', 'server_updated_at', v_applied ->> 'updated_at', 'current', v_applied);
end;
$$;
