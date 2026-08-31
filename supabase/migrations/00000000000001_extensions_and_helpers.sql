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

-- Returns true if the current authenticated user is a (non-removed) member
-- of the given trip. Centralizing this avoids repeating the same subquery
-- in every RLS policy and keeps policies auditable.
create or replace function public.is_trip_member(p_trip_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.trip_members tm
    where tm.trip_id = p_trip_id
      and tm.user_id = auth.uid()
  );
$$;

-- Returns true if the current authenticated user is an owner/editor of the
-- given trip (i.e. allowed to mutate its content, not just view it).
create or replace function public.is_trip_editor(p_trip_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.trip_members tm
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
    select 1
    from public.trip_members tm
    where tm.trip_id = p_trip_id
      and tm.user_id = auth.uid()
      and tm.role = 'owner'
  );
$$;
