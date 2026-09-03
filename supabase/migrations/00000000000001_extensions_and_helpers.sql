-- Extensions & shared helpers used by every subsequent migration.

create extension if not exists "pgcrypto" with schema extensions;

-- Generic "touch updated_at" trigger, reused by every table below instead of
-- redefining the same function per-table.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

