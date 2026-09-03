create type public.trip_member_role as enum ('owner', 'editor', 'viewer');

create table public.trip_members (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.trip_member_role not null default 'viewer',
  invited_by uuid references public.profiles (id) on delete set null,
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trip_id, user_id)
);

create index trip_members_trip_id_idx on public.trip_members (trip_id);
create index trip_members_user_id_idx on public.trip_members (user_id);

create trigger set_trip_members_updated_at
  before update on public.trip_members
  for each row
  execute function public.set_updated_at();

alter table public.trip_members enable row level security;

-- Returns true if the current authenticated user is a member of the given trip.
create or replace function public.is_trip_member(p_trip_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.trip_members tm
    where tm.trip_id = p_trip_id and tm.user_id = auth.uid()
  );
$$;

-- Returns true if the current authenticated user can edit the given trip.
create or replace function public.is_trip_editor(p_trip_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.trip_members tm
    where tm.trip_id = p_trip_id
      and tm.user_id = auth.uid()
      and tm.role in ('owner', 'editor')
  );
$$;

-- Returns true if the current authenticated user owns the given trip.
create or replace function public.is_trip_owner(p_trip_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.trip_members tm
    where tm.trip_id = p_trip_id
      and tm.user_id = auth.uid()
      and tm.role = 'owner'
  );
$$;

create policy "trips_select_members"
  on public.trips for select
  to authenticated
  using (public.is_trip_member(id));

create policy "trips_insert_self_as_owner"
  on public.trips for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy "trips_update_editors"
  on public.trips for update
  to authenticated
  using (public.is_trip_editor(id))
  with check (public.is_trip_editor(id));

create policy "trips_delete_owner"
  on public.trips for delete
  to authenticated
  using (public.is_trip_owner(id));

create policy "trip_members_select_members"
  on public.trip_members for select
  to authenticated
  using (public.is_trip_member(trip_id));

-- Owners/editors can add members; the very first member (the owner, on trip
-- creation) is allowed to insert themselves even before any row exists.
create policy "trip_members_insert_editors_or_self_owner"
  on public.trip_members for insert
  to authenticated
  with check (
    public.is_trip_editor(trip_id)
    or (
      user_id = auth.uid()
      and role = 'owner'
      and exists (
        select 1 from public.trips t
        where t.id = trip_id and t.owner_id = auth.uid()
      )
    )
  );

create policy "trip_members_update_owner"
  on public.trip_members for update
  to authenticated
  using (public.is_trip_owner(trip_id))
  with check (public.is_trip_owner(trip_id));

create policy "trip_members_delete_owner_or_self"
  on public.trip_members for delete
  to authenticated
  using (public.is_trip_owner(trip_id) or user_id = auth.uid());
