alter table public.activities
  add column if not exists place_name text,
  add column if not exists formatted_address text,
  add column if not exists place_id text;

create index if not exists activities_place_id_idx
  on public.activities (place_id)
  where place_id is not null;