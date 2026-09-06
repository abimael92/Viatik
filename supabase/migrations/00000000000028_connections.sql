-- Bidirectional, mutual request/accept graph between Viatik profiles.
--
-- This is the authorization edge that powers shared trips and settlements.
-- It is intentionally separate from the private `contacts` table (which stays
-- a per-user, unidirectional address book). The local Dexie layer materializes
-- a read model of the counterpart from each row's PUBLIC-ONLY snapshot.
--
-- The row carries a denormalized, public-only snapshot of BOTH parties so that
-- either side can render the counterpart offline (Dexie is the local source of
-- truth). The snapshot is allow-listed: it contains only directory fields and
-- a CHECK constraint rejects any payload carrying private fields (email, phone,
-- address, passport).

create type public.connection_status as enum ('pending', 'accepted', 'blocked');

-- Reject snapshots that smuggle a private field. Immutable so it can run in a
-- CHECK constraint. Defense in depth: the directory never returns these and the
-- mapper refuses them; this guarantees they are never persisted either.
create or replace function public.connection_snapshot_contains_private(p_snapshot jsonb)
returns boolean
language sql
immutable
as $$
  select exists (
    select 1
    from jsonb_object_keys(coalesce(p_snapshot, '{}'::jsonb)) as k
    where lower(replace(k, '_', '')) ~ 'email|phone|address|passport'
  );
$$;

create table public.connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  status public.connection_status not null default 'pending',
  requester_snapshot jsonb not null default '{}'::jsonb,
  recipient_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint connections_no_self check (requester_id <> recipient_id),
  constraint connections_requester_recipient_key unique (requester_id, recipient_id),
  constraint connections_requester_snapshot_public_chk
    check (not public.connection_snapshot_contains_private(requester_snapshot)),
  constraint connections_recipient_snapshot_public_chk
    check (not public.connection_snapshot_contains_private(recipient_snapshot))
);

create index connections_recipient_inbox_idx on public.connections (recipient_id, status);
create index connections_requester_outbox_idx on public.connections (requester_id, status);

-- Strict RLS: a user may only ever see or act on edges they are a party to.
-- There is deliberately NO blanket select.
alter table public.connections enable row level security;

create policy "connections_select_involved"
  on public.connections for select
  to authenticated
  using (requester_id = auth.uid() or recipient_id = auth.uid());

create policy "connections_insert_own_request"
  on public.connections for insert
  to authenticated
  with check (requester_id = auth.uid() and status = 'pending');

create policy "connections_update_recipient"
  on public.connections for update
  to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid() and status in ('accepted', 'blocked'));

-- ---------------------------------------------------------------------------
-- Offline-first write path: an idempotent, RLS-respecting CAS upsert mirroring
-- `sync_contact_cas_upsert`. Handles the request insert (pending) AND the
-- recipient's accept/decline (update to accepted/blocked). Security invoker so
-- the underlying RLS policies above still gate every read/write.
-- ---------------------------------------------------------------------------
create function public.sync_connection_cas_upsert(
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
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'p_payload must be a JSON object' using errcode = '22023';
  end if;

  begin
    v_id := (p_payload ->> 'id')::uuid;
  exception when invalid_text_representation then
    raise exception 'p_payload.id must be a UUID' using errcode = '22023';
  end;
  if v_id is null then
    raise exception 'p_payload.id is required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('connections:' || v_id::text, 0));
  v_payload := p_payload - 'updated_at' - 'created_at';

  select c.updated_at, to_jsonb(c)
  into v_current_updated_at, v_current
  from public.connections c
  where c.id = v_id
  for update;

  if not found then
    if p_base_updated_at is not null then
      return jsonb_build_object('status', 'not_found');
    end if;
    insert into public.connections
    select (jsonb_populate_record(
      null::public.connections,
      v_payload || jsonb_build_object('id', v_id, 'created_at', now(), 'updated_at', now())
    )).*
    returning to_jsonb(connections.*) into v_applied;
  elsif p_base_updated_at is null or v_current_updated_at <> p_base_updated_at then
    return jsonb_build_object(
      'status', 'conflict',
      'server_updated_at', v_current_updated_at,
      'current', v_current
    );
  else
    with payload as (
      select jsonb_populate_record(c, v_payload) as row
      from public.connections c
      where c.id = v_id
    )
    -- Snapshots are immutable after insert: they are the requester's public
    -- projection captured when the edge is created, and must not be overwritten
    -- when the recipient later accepts or declines.
    update public.connections c
    set requester_id = (payload.row).requester_id,
        recipient_id = (payload.row).recipient_id,
        status = (payload.row).status
    from payload
    where c.id = v_id
      and c.updated_at = p_base_updated_at
    returning to_jsonb(c.*) into v_applied;
  end if;

  if v_applied is null then
    return jsonb_build_object(
      'status', 'conflict',
      'server_updated_at', v_current_updated_at,
      'current', v_current
    );
  end if;
  return jsonb_build_object(
    'status', 'applied',
    'server_updated_at', v_applied -> 'updated_at',
    'current', v_applied
  );
exception when unique_violation then
  select to_jsonb(c) into v_current
  from public.connections c
  where c.id = v_id;
  return jsonb_build_object(
    'status', 'conflict',
    'server_updated_at', v_current -> 'updated_at',
    'current', v_current
  );
end;
$$;

revoke all on function public.sync_connection_cas_upsert(jsonb, timestamptz) from public;
grant execute on function public.sync_connection_cas_upsert(jsonb, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- The "magic" QR auto-accept path. Called by the authenticated server action
-- AFTER it has verified the scanned, short-lived signature. SECURITY DEFINER so
-- it can create an immediately-'accepted' edge (bypassing the inbox), but it
-- still hard-enforces that the CURRENT user is the requester and that the
-- recipient exists. Snapshots are filled from the public directory, never from
-- caller-supplied data, so the client cannot inject private fields.
-- ---------------------------------------------------------------------------
create function public.accept_connection_from_qr(p_recipient_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requester uuid := auth.uid();
  v_req_snap jsonb;
  v_recip_snap jsonb;
  v_row public.connections%rowtype;
begin
  if v_requester is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_recipient_id is null or p_recipient_id = v_requester then
    raise exception 'Invalid recipient' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'profile_id', pd.profile_id,
    'viatik_id', pd.viatik_id,
    'display_name', pd.display_name,
    'avatar_url', pd.avatar_url,
    'avatar_seed', pd.avatar_seed,
    'public_handle', pd.public_handle
  ) into v_recip_snap
  from public.profile_directory pd
  where pd.profile_id = p_recipient_id;

  if v_recip_snap is null then
    raise exception 'Recipient not found' using errcode = '42704';
  end if;

  select jsonb_build_object(
    'profile_id', pd.profile_id,
    'viatik_id', pd.viatik_id,
    'display_name', pd.display_name,
    'avatar_url', pd.avatar_url,
    'avatar_seed', pd.avatar_seed,
    'public_handle', pd.public_handle
  ) into v_req_snap
  from public.profile_directory pd
  where pd.profile_id = v_requester;

  -- The requester's own directory row should exist (always-discoverable). If
  -- not (should not happen), fall back to a minimal snapshot rather than fail.
  if v_req_snap is null then
    v_req_snap := jsonb_build_object('profile_id', v_requester);
  end if;

  insert into public.connections (
    requester_id, recipient_id, status, requester_snapshot, recipient_snapshot
  ) values (
    v_requester, p_recipient_id, 'accepted', v_req_snap, v_recip_snap
  )
  on conflict (requester_id, recipient_id) do update
    set status = 'accepted',
        requester_snapshot = excluded.requester_snapshot,
        recipient_snapshot = excluded.recipient_snapshot,
        updated_at = now()
  returning to_jsonb(connections.*) into v_row;

  -- If the counterpart had already requested us, upgrade that reverse edge too
  -- so the graph is symmetric after a scan.
  update public.connections
  set status = 'accepted', updated_at = now()
  where requester_id = p_recipient_id and recipient_id = v_requester;

  return jsonb_build_object('status', 'applied', 'connection', to_jsonb(v_row));
end;
$$;

revoke all on function public.accept_connection_from_qr(uuid) from public;
grant execute on function public.accept_connection_from_qr(uuid) to authenticated;
