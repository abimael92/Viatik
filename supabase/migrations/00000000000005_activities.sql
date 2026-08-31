create table public.activities (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  day_date date not null,
  title text not null,
  description text,
  location text,
  category text not null default 'general',
  start_time timestamptz,
  end_time timestamptz,
  -- Fractional ordering key within a day column; lets the drag-and-drop
  -- board reorder/move cards without rewriting every sibling row.
  position double precision not null default 0,
  created_by uuid not null references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index activities_trip_id_day_date_idx on public.activities (trip_id, day_date, position);

create trigger set_activities_updated_at
  before update on public.activities
  for each row
  execute function public.set_updated_at();

alter table public.activities enable row level security;

create policy "activities_select_members"
  on public.activities for select
  to authenticated
  using (public.is_trip_member(trip_id));

create policy "activities_insert_editors"
  on public.activities for insert
  to authenticated
  with check (public.is_trip_editor(trip_id));

create policy "activities_update_editors"
  on public.activities for update
  to authenticated
  using (public.is_trip_editor(trip_id))
  with check (public.is_trip_editor(trip_id));

create policy "activities_delete_editors"
  on public.activities for delete
  to authenticated
  using (public.is_trip_editor(trip_id));
