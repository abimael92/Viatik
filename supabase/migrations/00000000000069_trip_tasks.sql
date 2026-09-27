-- Crew research tasks. Members of the trip can read and write them.
-- Images stay on the existing trip media upload; this row only stores their paths.
-- Synced by sync_trip_task_cas_upsert, not the shared CAS function.

create table public.trip_tasks (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  creator_id uuid not null references public.profiles (id) on delete cascade,
  assignee_id uuid references public.profiles (id) on delete set null,
  title text not null check (char_length(trim(title)) between 1 and 120),
  description text,
  resolution_text text,
  status text not null default 'open' check (status in ('open', 'resolved')),
  attachments jsonb check (attachments is null or jsonb_typeof(attachments) = 'array'),
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles (id) on delete cascade,
  updated_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles (id) on delete cascade,
  version bigint not null default 1 check (version > 0),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null
);

create index trip_tasks_trip_status_idx on public.trip_tasks (trip_id, status, updated_at desc);

alter table public.trip_tasks enable row level security;

create policy "trip_tasks_select_members"
  on public.trip_tasks for select to authenticated
  using (public.is_trip_member(trip_id));

create policy "trip_tasks_insert_members"
  on public.trip_tasks for insert to authenticated
  with check (
    public.is_trip_member(trip_id)
    and creator_id = auth.uid()
    and created_by = auth.uid()
    and updated_by = auth.uid()
  );

create policy "trip_tasks_update_members"
  on public.trip_tasks for update to authenticated
  using (public.is_trip_member(trip_id))
  with check (public.is_trip_member(trip_id));

create or replace function public.sync_trip_task_cas_upsert(
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
  v_task public.trip_tasks;
begin
  if v_id is null then
    raise exception 'p_payload.id is required' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('tripTask:' || v_id::text, 0));

  select * into v_task from public.trip_tasks where id = v_id for update;
  if not found then
    if p_base_updated_at is not null then
      return jsonb_build_object('status', 'not_found');
    end if;
    insert into public.trip_tasks
      select (jsonb_populate_record(null::public.trip_tasks, p_payload || jsonb_build_object(
        'id', v_id,
        'created_at', coalesce(nullif(p_payload ->> 'created_at', '')::timestamptz, now()),
        'updated_at', now(),
        'version', 1
      ))).*;
  elsif p_base_updated_at is null or v_task.updated_at <> p_base_updated_at then
    return jsonb_build_object('status', 'conflict', 'server_updated_at', v_task.updated_at, 'current', to_jsonb(v_task));
  else
    update public.trip_tasks set
      assignee_id = nullif(p_payload ->> 'assignee_id', '')::uuid,
      title = p_payload ->> 'title',
      description = nullif(p_payload ->> 'description', ''),
      resolution_text = nullif(p_payload ->> 'resolution_text', ''),
      status = p_payload ->> 'status',
      attachments = coalesce(p_payload -> 'attachments', '[]'::jsonb),
      updated_at = now(),
      updated_by = auth.uid(),
      version = version + 1,
      deleted_at = nullif(p_payload ->> 'deleted_at', '')::timestamptz,
      deleted_by = nullif(p_payload ->> 'deleted_by', '')::uuid
    where id = v_id and updated_at = p_base_updated_at;
  end if;

  select * into v_task from public.trip_tasks where id = v_id;
  if v_task.id is null then
    return jsonb_build_object('status', 'conflict');
  end if;
  return jsonb_build_object('status', 'applied', 'server_updated_at', v_task.updated_at, 'current', to_jsonb(v_task));
end;
$$;

revoke all on function public.sync_trip_task_cas_upsert(jsonb, timestamptz) from public;
grant execute on function public.sync_trip_task_cas_upsert(jsonb, timestamptz) to authenticated;
