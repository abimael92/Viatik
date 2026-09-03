create table public.trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  description text,
  destination text,
  start_date date,
  end_date date,
  cover_image_url text,
  base_currency text not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint trips_date_range_chk check (
    start_date is null or end_date is null or end_date >= start_date
  )
);

create index trips_owner_id_idx on public.trips (owner_id);

create trigger set_trips_updated_at
  before update on public.trips
  for each row
  execute function public.set_updated_at();

alter table public.trips enable row level security;
