-- Make every profile always linkable by Viatik ID / QR code.
-- The discoverability opt-in is removed: any user can be scanned or looked up at any time.

-- Drop the trigger and sync function first so we can remove the discoverable columns safely.
drop trigger if exists sync_profile_directory_after_write on public.profiles;
drop function if exists public.sync_profile_directory();

-- Drop the now-unused index and columns.
drop index if exists public.profile_directory_discoverable_idx;
alter table public.profiles drop column if exists discoverable;
alter table public.profile_directory drop column if exists discoverable;

-- Keep the directory projection in sync with every profile write, regardless of opt-in status.
create or replace function public.sync_profile_directory()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display text := coalesce(nullif(btrim(new.full_name), ''), 'Viatik user');
begin
  insert into public.profile_directory (
    profile_id, viatik_id, display_name, avatar_url, avatar_seed, public_handle,
    preferred_currency, preferred_language, created_at, updated_at
  ) values (
    new.id, new.viatik_id, v_display, new.avatar_url, new.avatar_seed, new.public_handle,
    new.preferred_currency, new.preferred_language, now(), now()
  )
  on conflict (profile_id) do update set
    viatik_id = excluded.viatik_id,
    display_name = excluded.display_name,
    avatar_url = excluded.avatar_url,
    avatar_seed = excluded.avatar_seed,
    public_handle = excluded.public_handle,
    preferred_currency = excluded.preferred_currency,
    preferred_language = excluded.preferred_language,
    updated_at = now();
  return new;
end;
$$;

create trigger sync_profile_directory_after_write
  after insert or update on public.profiles
  for each row execute function public.sync_profile_directory();

-- Backfill any profiles that are not yet in the directory.
insert into public.profile_directory (
  profile_id, viatik_id, display_name, avatar_url, avatar_seed, public_handle,
  preferred_currency, preferred_language, created_at, updated_at
)
select
  id, viatik_id, coalesce(nullif(btrim(full_name), ''), 'Viatik user'),
  avatar_url, avatar_seed, public_handle, preferred_currency, preferred_language,
  now(), now()
from public.profiles
where not exists (
  select 1 from public.profile_directory pd where pd.profile_id = public.profiles.id
)
on conflict (profile_id) do update set
  viatik_id = excluded.viatik_id,
  display_name = excluded.display_name,
  avatar_url = excluded.avatar_url,
  avatar_seed = excluded.avatar_seed,
  public_handle = excluded.public_handle,
  preferred_currency = excluded.preferred_currency,
  preferred_language = excluded.preferred_language,
  updated_at = now();

-- Rate-limited lookup now returns any profile with a matching Viatik ID or UUID.
-- The return type is unchanged, but the discoverability filter is removed.
drop function if exists public.lookup_profile_for_linking(text);
create or replace function public.lookup_profile_for_linking(p_identifier text)
returns table (
  profile_id uuid,
  viatik_id text,
  display_name text,
  avatar_url text,
  avatar_seed text,
  public_handle text,
  preferred_currency text,
  preferred_language text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id text;
  v_window timestamptz;
  v_attempts integer;
  v_max constant integer := 30;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  -- Accept both Viatik IDs (VTK-...) and raw UUIDs
  v_id := trim(p_identifier);
  if v_id !~ '^VTK-[0-9A-F]{16}$' and v_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'Invalid Viatik ID' using errcode = '22023';
  end if;

  -- Sliding-window rate limit: 30 lookups per authenticated user per 60 seconds.
  select window_start, attempts
  into v_window, v_attempts
  from public.profile_lookup_attempts
  where user_id = v_uid
  for update;

  if not found or v_window is null or v_window + interval '60 seconds' <= now() then
    v_window := now();
    v_attempts := 0;
  end if;
  v_attempts := v_attempts + 1;
  if v_attempts > v_max then
    raise exception 'Rate limit exceeded. Try again later.' using errcode = '42900';
  end if;

  insert into public.profile_lookup_attempts (user_id, window_start, attempts)
  values (v_uid, v_window, v_attempts)
  on conflict (user_id) do update set
    window_start = excluded.window_start,
    attempts = excluded.attempts;

  return query
  select
    pd.profile_id, pd.viatik_id, pd.display_name, pd.avatar_url, pd.avatar_seed,
    pd.public_handle, pd.preferred_currency, pd.preferred_language
  from public.profile_directory pd
  where pd.viatik_id = upper(v_id)
     or pd.profile_id::text = lower(v_id)
  limit 1;
end;
$$;

revoke all on function public.lookup_profile_for_linking(text) from public;
grant execute on function public.lookup_profile_for_linking(text) to authenticated;
