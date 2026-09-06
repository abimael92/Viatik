-- Social & Access Sharing: public, read-only guest share links.
--
-- A trip owner generates a high-entropy `slug` link that unauthenticated
-- guests can open at `/share/[slug]`. The local share links table syncs here
-- via the outbox (dedicated CAS functions below), and the public route reads
-- this table with the server-side service client. Guests are read-only and
-- never authenticate.

create table public.trip_share_links (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  -- Public token embedded in the guest URL. High-entropy, generated client-side.
  slug text not null,
  -- Optional human label, e.g. "Family link".
  label text,
  created_by uuid not null references public.profiles (id) on delete set null,
  -- Per-section guest permissions, all on by default.
  allow_itinerary boolean not null default true,
  allow_map boolean not null default true,
  allow_gallery boolean not null default true,
  -- Soft switch to revoke guest access without deleting the link.
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint trip_share_links_slug_key unique (slug)
);

create index trip_share_links_trip_id_idx on public.trip_share_links (trip_id, updated_at);

create trigger set_trip_share_links_updated_at
  before insert or update on public.trip_share_links
  for each row execute function public.set_updated_at();

create trigger enforce_trip_share_links_created_by
  before insert or update on public.trip_share_links
  for each row execute function public.enforce_created_by();

alter table public.trip_share_links enable row level security;

-- Management is owner-only: links are private artifacts of the trip owner and
-- are never readable/writable by other members or by anon. The public route
-- does NOT rely on these policies — it uses the server-side service client.
create policy "trip_share_links_select_owner"
  on public.trip_share_links for select
  to authenticated
  using (public.is_trip_owner(trip_id));

create policy "trip_share_links_insert_owner"
  on public.trip_share_links for insert
  to authenticated
  with check (public.is_trip_owner(trip_id));

create policy "trip_share_links_update_owner"
  on public.trip_share_links for update
  to authenticated
  using (public.is_trip_owner(trip_id))
  with check (public.is_trip_owner(trip_id));

create policy "trip_share_links_delete_owner"
  on public.trip_share_links for delete
  to authenticated
  using (public.is_trip_owner(trip_id));

-- ---------------------------------------------------------------------------
-- CAS upsert/delete for the local → remote push path. Security invoker (so RLS
-- on the table applies) with an explicit owner check for defense in depth.
-- ---------------------------------------------------------------------------

create or replace function public.sync_trip_share_link_cas_upsert(
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
  if not public.is_trip_owner(v_trip_id) then
    raise exception 'only the trip owner can manage share links' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('trip_share_links:' || v_id::text, 0));
  v_payload := p_payload - 'updated_at' - 'created_at';

  select updated_at, to_jsonb(t) into v_current_updated_at, v_current from public.trip_share_links t where t.id = v_id for update;
  if not found then
    if p_base_updated_at is not null then return jsonb_build_object('status', 'not_found'); end if;
    insert into public.trip_share_links select (jsonb_populate_record(null::public.trip_share_links, v_payload || jsonb_build_object('id', v_id, 'created_at', now(), 'updated_at', now()))).*;
    v_applied := jsonb_build_object('updated_at', now());
  elsif p_base_updated_at is null or v_current_updated_at <> p_base_updated_at then
    return jsonb_build_object('status', 'conflict', 'server_updated_at', v_current_updated_at, 'current', v_current);
  else
    if v_current ->> 'trip_id' <> v_trip_id::text then
      raise exception 'trip_id is immutable for share links' using errcode = '23514';
    end if;
    with p as (select jsonb_populate_record(t, v_payload) r from public.trip_share_links t where t.id = v_id)
    update public.trip_share_links t set
      slug=(p.r).slug,
      label=(p.r).label,
      allow_itinerary=(p.r).allow_itinerary,
      allow_map=(p.r).allow_map,
      allow_gallery=(p.r).allow_gallery,
      active=(p.r).active,
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
  select to_jsonb(t) into v_current from public.trip_share_links t where id = v_id;
  return jsonb_build_object('status', 'conflict', 'server_updated_at', v_current -> 'updated_at', 'current', v_current);
end;
$$;

create or replace function public.sync_trip_share_link_cas_delete(
  p_id uuid,
  p_base_updated_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_trip_id uuid;
  v_current jsonb;
  v_current_updated_at timestamptz;
begin
  if p_id is null or p_base_updated_at is null then
    raise exception 'p_id and p_base_updated_at are required' using errcode = '22023';
  end if;

  select trip_id, updated_at, to_jsonb(t) into v_trip_id, v_current_updated_at, v_current
  from public.trip_share_links t where t.id = p_id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if not public.is_trip_owner(v_trip_id) then
    raise exception 'only the trip owner can manage share links' using errcode = '42501';
  end if;

  if v_current_updated_at <> p_base_updated_at then
    return jsonb_build_object('status', 'conflict', 'server_updated_at', v_current_updated_at, 'current', v_current);
  end if;

  delete from public.trip_share_links where id = p_id and updated_at = p_base_updated_at;
  if not found then return jsonb_build_object('status','conflict','server_updated_at',v_current_updated_at,'current',v_current); end if;
  return jsonb_build_object('status', 'applied', 'server_updated_at', v_current_updated_at, 'current', v_current);
end;
$$;

revoke all on function public.sync_trip_share_link_cas_upsert(jsonb, timestamptz) from public;
revoke all on function public.sync_trip_share_link_cas_delete(uuid, timestamptz) from public;
grant execute on function public.sync_trip_share_link_cas_upsert(jsonb, timestamptz) to authenticated;
grant execute on function public.sync_trip_share_link_cas_delete(uuid, timestamptz) to authenticated;

alter publication supabase_realtime add table public.trip_share_links;
