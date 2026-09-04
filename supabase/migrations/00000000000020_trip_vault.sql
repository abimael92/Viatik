-- Trip Vault: encrypted per-user keysets and ciphertext entries.
-- No plaintext is stored on the server. RLS enforces owner-only access.

create table public.vault_keysets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  salt text not null check (length(salt) > 0),
  verification_ciphertext text not null check (length(verification_ciphertext) > 0),
  verification_iv text not null check (length(verification_iv) > 0),
  kdf text not null default 'PBKDF2-SHA256' check (kdf = 'PBKDF2-SHA256'),
  iterations integer not null check (iterations between 1000 and 10000000),
  key_version integer not null default 1 check (key_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id)
);

create index vault_keysets_owner_id_idx on public.vault_keysets (owner_id, updated_at);

create trigger set_vault_keysets_updated_at
  before update on public.vault_keysets
  for each row
  execute function public.set_updated_at();

alter table public.vault_keysets enable row level security;

create policy "vault_keysets_select_owner" on public.vault_keysets for select to authenticated using (owner_id = auth.uid());
create policy "vault_keysets_insert_owner" on public.vault_keysets for insert to authenticated with check (owner_id = auth.uid());
create policy "vault_keysets_update_owner" on public.vault_keysets for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "vault_keysets_delete_owner" on public.vault_keysets for delete to authenticated using (owner_id = auth.uid());

create table public.vault_entries (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  ciphertext text not null check (length(ciphertext) > 0),
  initialization_vector text not null check (length(initialization_vector) > 0),
  key_version integer not null default 1 check (key_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index vault_entries_trip_owner_idx on public.vault_entries (trip_id, owner_id, updated_at);

create trigger set_vault_entries_updated_at
  before update on public.vault_entries
  for each row
  execute function public.set_updated_at();

alter table public.vault_entries enable row level security;

create policy "vault_entries_select_owner" on public.vault_entries for select to authenticated using (
  owner_id = auth.uid() and public.is_active_trip_member(trip_id, auth.uid())
);
create policy "vault_entries_insert_owner" on public.vault_entries for insert to authenticated with check (
  owner_id = auth.uid() and public.is_active_trip_member(trip_id, auth.uid())
);
create policy "vault_entries_update_owner" on public.vault_entries for update to authenticated using (
  owner_id = auth.uid() and public.is_active_trip_member(trip_id, auth.uid())
) with check (
  owner_id = auth.uid() and public.is_active_trip_member(trip_id, auth.uid())
);
create policy "vault_entries_delete_owner" on public.vault_entries for delete to authenticated using (
  owner_id = auth.uid() and public.is_active_trip_member(trip_id, auth.uid())
);

create or replace function public.sync_vault_keyset_cas_upsert(
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
  v_owner_id uuid;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'p_payload must be a JSON object' using errcode = '22023';
  end if;

  begin
    v_id := (p_payload ->> 'id')::uuid;
    v_owner_id := (p_payload ->> 'owner_id')::uuid;
  exception when invalid_text_representation then
    raise exception 'payload id and owner_id must be UUIDs' using errcode = '22023';
  end;

  if v_id is null then
    raise exception 'payload id is required' using errcode = '22023';
  end if;
  if v_owner_id is null or v_owner_id <> auth.uid() then
    raise exception 'vault keysets may only be written by their owner' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('vault_keysets:' || v_id::text, 0));
  v_payload := p_payload - 'updated_at' - 'created_at';

  select updated_at, to_jsonb(t) into v_current_updated_at, v_current from public.vault_keysets t where t.id = v_id for update;
  if not found then
    if p_base_updated_at is not null then return jsonb_build_object('status', 'not_found'); end if;
    insert into public.vault_keysets select (jsonb_populate_record(null::public.vault_keysets, v_payload || jsonb_build_object('id', v_id, 'created_at', now(), 'updated_at', now()))).*;
    v_applied := jsonb_build_object('updated_at', now());
  elsif p_base_updated_at is null or v_current_updated_at <> p_base_updated_at then
    return jsonb_build_object('status', 'conflict', 'server_updated_at', v_current_updated_at, 'current', v_current);
  else
    with p as (select jsonb_populate_record(t, v_payload) r from public.vault_keysets t where t.id = v_id)
    update public.vault_keysets t set
      salt=(p.r).salt,
      verification_ciphertext=(p.r).verification_ciphertext,
      verification_iv=(p.r).verification_iv,
      kdf=(p.r).kdf,
      iterations=(p.r).iterations,
      key_version=(p.r).key_version
    from p
    where t.id = v_id and t.updated_at = p_base_updated_at and t.owner_id = v_owner_id
    returning to_jsonb(t.*) into v_applied;
  end if;

  if v_applied is null then
    return jsonb_build_object('status', 'conflict', 'server_updated_at', v_current_updated_at, 'current', v_current);
  end if;
  return jsonb_build_object('status', 'applied', 'server_updated_at', v_applied -> 'updated_at', 'current', v_applied);
exception when unique_violation then
  select to_jsonb(t) into v_current from public.vault_keysets t where id = v_id;
  return jsonb_build_object('status', 'conflict', 'server_updated_at', v_current -> 'updated_at', 'current', v_current);
end;
$$;

create or replace function public.sync_vault_entry_cas_upsert(
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
  v_owner_id uuid;
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
    v_owner_id := (p_payload ->> 'owner_id')::uuid;
  exception when invalid_text_representation then
    raise exception 'payload id, trip_id, and owner_id must be UUIDs' using errcode = '22023';
  end;

  if v_id is null or v_trip_id is null or v_owner_id is null then
    raise exception 'payload id, trip_id, and owner_id are required' using errcode = '22023';
  end if;
  if v_owner_id <> auth.uid() then
    raise exception 'vault entries may only be written by their owner' using errcode = '42501';
  end if;
  if not public.is_active_trip_member(v_trip_id, auth.uid()) then
    raise exception 'owner is not an active member of this trip' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('vault_entries:' || v_id::text, 0));
  v_payload := p_payload - 'updated_at' - 'created_at';

  select updated_at, to_jsonb(t) into v_current_updated_at, v_current from public.vault_entries t where t.id = v_id for update;
  if not found then
    if p_base_updated_at is not null then return jsonb_build_object('status', 'not_found'); end if;
    insert into public.vault_entries select (jsonb_populate_record(null::public.vault_entries, v_payload || jsonb_build_object('id', v_id, 'created_at', now(), 'updated_at', now()))).*;
    v_applied := jsonb_build_object('updated_at', now());
  elsif p_base_updated_at is null or v_current_updated_at <> p_base_updated_at then
    return jsonb_build_object('status', 'conflict', 'server_updated_at', v_current_updated_at, 'current', v_current);
  else
    if v_current ->> 'trip_id' <> v_trip_id::text or v_current ->> 'owner_id' <> v_owner_id::text then
      raise exception 'vault entry trip_id and owner_id are immutable' using errcode = '23514';
    end if;
    with p as (select jsonb_populate_record(t, v_payload) r from public.vault_entries t where t.id = v_id)
    update public.vault_entries t set
      trip_id=(p.r).trip_id,
      owner_id=(p.r).owner_id,
      ciphertext=(p.r).ciphertext,
      initialization_vector=(p.r).initialization_vector,
      key_version=(p.r).key_version,
      deleted_at=(p.r).deleted_at
    from p
    where t.id = v_id and t.updated_at = p_base_updated_at and t.owner_id = v_owner_id
    returning to_jsonb(t.*) into v_applied;
  end if;

  if v_applied is null then
    return jsonb_build_object('status', 'conflict', 'server_updated_at', v_current_updated_at, 'current', v_current);
  end if;
  return jsonb_build_object('status', 'applied', 'server_updated_at', v_applied -> 'updated_at', 'current', v_applied);
exception when unique_violation then
  v_current := null;
  select to_jsonb(t) into v_current from public.vault_entries t where id = v_id;
  return jsonb_build_object('status', 'conflict', 'server_updated_at', v_current -> 'updated_at', 'current', v_current);
end;
$$;

create or replace function public.sync_vault_keyset_cas_delete(
  p_id uuid,
  p_base_updated_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_current jsonb;
  v_current_updated_at timestamptz;
begin
  if p_id is null or p_base_updated_at is null then
    raise exception 'p_id and p_base_updated_at are required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('vault_keysets:' || p_id::text, 0));
  select updated_at, to_jsonb(t) into v_current_updated_at, v_current from public.vault_keysets t where t.id = p_id and t.owner_id = auth.uid() for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_current_updated_at <> p_base_updated_at then
    return jsonb_build_object('status', 'conflict', 'server_updated_at', v_current_updated_at, 'current', v_current);
  end if;

  delete from public.vault_keysets where id = p_id and updated_at = p_base_updated_at and owner_id = auth.uid();
  return jsonb_build_object('status', 'applied', 'server_updated_at', v_current_updated_at, 'current', v_current);
end;
$$;

create or replace function public.sync_vault_entry_cas_delete(
  p_id uuid,
  p_base_updated_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_current jsonb;
  v_current_updated_at timestamptz;
begin
  if p_id is null or p_base_updated_at is null then
    raise exception 'p_id and p_base_updated_at are required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('vault_entries:' || p_id::text, 0));
  select updated_at, to_jsonb(t) into v_current_updated_at, v_current from public.vault_entries t where t.id = p_id and t.owner_id = auth.uid() for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_current_updated_at <> p_base_updated_at then
    return jsonb_build_object('status', 'conflict', 'server_updated_at', v_current_updated_at, 'current', v_current);
  end if;

  delete from public.vault_entries where id = p_id and updated_at = p_base_updated_at and owner_id = auth.uid();
  return jsonb_build_object('status', 'applied', 'server_updated_at', v_current_updated_at, 'current', v_current);
end;
$$;

revoke all on function public.sync_vault_keyset_cas_upsert(jsonb, timestamptz) from public;
revoke all on function public.sync_vault_entry_cas_upsert(jsonb, timestamptz) from public;
revoke all on function public.sync_vault_keyset_cas_delete(uuid, timestamptz) from public;
revoke all on function public.sync_vault_entry_cas_delete(uuid, timestamptz) from public;

grant execute on function public.sync_vault_keyset_cas_upsert(jsonb, timestamptz) to authenticated;
grant execute on function public.sync_vault_entry_cas_upsert(jsonb, timestamptz) to authenticated;
grant execute on function public.sync_vault_keyset_cas_delete(uuid, timestamptz) to authenticated;
grant execute on function public.sync_vault_entry_cas_delete(uuid, timestamptz) to authenticated;

alter publication supabase_realtime add table public.vault_keysets, public.vault_entries;
