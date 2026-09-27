-- Shared trip notes. Members can read and write notes on trips they belong to.
-- Soft delete keeps the row so other devices can drop it on the next sync.
-- This table is synced by sync_trip_note_cas_upsert, not the shared CAS function.

create table public.trip_notes (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  content text not null check (char_length(trim(content)) between 1 and 280),
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles (id) on delete cascade,
  updated_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles (id) on delete cascade,
  version bigint not null default 1 check (version > 0),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null
);

create index trip_notes_trip_updated_idx on public.trip_notes (trip_id, updated_at desc);

alter table public.trip_notes enable row level security;

create policy "trip_notes_select_members"
  on public.trip_notes for select to authenticated
  using (public.is_trip_member(trip_id));

create policy "trip_notes_insert_members"
  on public.trip_notes for insert to authenticated
  with check (
    public.is_trip_member(trip_id)
    and user_id = auth.uid()
    and created_by = auth.uid()
    and updated_by = auth.uid()
  );

create policy "trip_notes_update_members"
  on public.trip_notes for update to authenticated
  using (public.is_trip_member(trip_id))
  with check (public.is_trip_member(trip_id));

create or replace function public.sync_trip_note_cas_upsert(
  p_payload jsonb,
  p_base_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid := (p_payload ->> 'id')::uuid;
  v_note public.trip_notes;
begin
  if v_id is null then
    raise exception 'p_payload.id is required' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('tripNote:' || v_id::text, 0));

  select * into v_note from public.trip_notes where id = v_id for update;
  if not found then
    if p_base_updated_at is not null then
      return jsonb_build_object('status', 'not_found');
    end if;
    insert into public.trip_notes
      select (jsonb_populate_record(null::public.trip_notes, p_payload || jsonb_build_object(
        'id', v_id,
        'created_at', coalesce(nullif(p_payload ->> 'created_at', '')::timestamptz, now()),
        'updated_at', now(),
        'version', 1
      ))).*;
  elsif p_base_updated_at is null or v_note.updated_at <> p_base_updated_at then
    return jsonb_build_object('status', 'conflict', 'server_updated_at', v_note.updated_at, 'current', to_jsonb(v_note));
  else
    update public.trip_notes set
      content = p_payload ->> 'content',
      updated_at = now(),
      updated_by = auth.uid(),
      version = version + 1,
      deleted_at = nullif(p_payload ->> 'deleted_at', '')::timestamptz,
      deleted_by = nullif(p_payload ->> 'deleted_by', '')::uuid
    where id = v_id and updated_at = p_base_updated_at;
  end if;

  select * into v_note from public.trip_notes where id = v_id;
  if v_note.id is null then
    return jsonb_build_object('status', 'conflict');
  end if;
  return jsonb_build_object('status', 'applied', 'server_updated_at', v_note.updated_at, 'current', to_jsonb(v_note));
end;
$$;

revoke all on function public.sync_trip_note_cas_upsert(jsonb, timestamptz) from public;
grant execute on function public.sync_trip_note_cas_upsert(jsonb, timestamptz) to authenticated;
