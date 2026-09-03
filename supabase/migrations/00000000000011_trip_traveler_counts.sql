alter table public.trips
  add column adult_count integer not null default 1 check (adult_count >= 0),
  add column child_count integer not null default 0 check (child_count >= 0),
  add constraint trips_traveler_count_chk check (adult_count + child_count > 0);
