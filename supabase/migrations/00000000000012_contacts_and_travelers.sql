create type public.traveler_type as enum ('adult', 'child');

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  full_name text not null check (length(trim(full_name)) > 0),
  email text,
  phone text,
  linked_profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index contacts_owner_id_idx on public.contacts (owner_id, updated_at);
create trigger set_contacts_updated_at before update on public.contacts for each row execute function public.set_updated_at();
alter table public.contacts enable row level security;
create policy "contacts_select_owner" on public.contacts for select to authenticated using (owner_id = auth.uid());
create policy "contacts_insert_owner" on public.contacts for insert to authenticated with check (owner_id = auth.uid());
create policy "contacts_update_owner" on public.contacts for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "contacts_delete_owner" on public.contacts for delete to authenticated using (owner_id = auth.uid());

create table public.trip_travelers (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete restrict,
  display_name text not null check (length(trim(display_name)) > 0),
  traveler_type public.traveler_type not null default 'adult',
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (trip_id, contact_id)
);
create index trip_travelers_trip_id_idx on public.trip_travelers (trip_id, updated_at);
create trigger set_trip_travelers_updated_at before update on public.trip_travelers for each row execute function public.set_updated_at();
alter table public.trip_travelers enable row level security;
create policy "trip_travelers_select_members" on public.trip_travelers for select to authenticated using (public.is_trip_member(trip_id));
create policy "trip_travelers_insert_editors" on public.trip_travelers for insert to authenticated with check (
  public.is_trip_editor(trip_id) and created_by = auth.uid()
  and exists (select 1 from public.contacts c where c.id = contact_id and c.owner_id = auth.uid() and c.deleted_at is null)
);
create policy "trip_travelers_update_editors" on public.trip_travelers for update to authenticated using (public.is_trip_editor(trip_id)) with check (public.is_trip_editor(trip_id));
create policy "trip_travelers_delete_editors" on public.trip_travelers for delete to authenticated using (public.is_trip_editor(trip_id));

alter publication supabase_realtime add table public.contacts, public.trip_travelers;
