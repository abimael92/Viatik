-- Profile Directory: a public, allow-listed projection of profiles used solely
-- for account linking by Viatik ID. It deliberately contains NO private fields
-- (email, phone, etc.) and is unreadable directly — the only read path is the
-- security-definer, rate-limited lookup function below. Direct table access is
-- fully denied by enabling RLS without any policies.

-- Opt-in flag on the private profile.
alter table public.profiles
  add column discoverable boolean not null default false;

-- Public directory projection. No email/phone columns exist here.
create table public.profile_directory (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  viatik_id text not null,
  display_name text not null check (char_length(trim(display_name)) between 2 and 100),
  avatar_url text,
  public_handle text,
  preferred_currency text not null default 'USD',
  preferred_language text not null default 'en',
  discoverable boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_directory_viatik_id_key unique (viatik_id),
  constraint profile_directory_viatik_id_format_chk check (viatik_id ~ '^VTK-[0-9A-F]{16}$'),
  constraint profile_directory_public_handle_format_chk check (
    public_handle is null or public_handle ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{2,29}$'
  ),
  constraint profile_directory_preferred_currency_chk check (preferred_currency ~ '^[A-Z]{3}$'),
  constraint profile_directory_preferred_language_chk check (preferred_language ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$')
);

create index profile_directory_discoverable_idx on public.profile_directory (discoverable, viatik_id);

-- RLS is enabled with NO policies: direct reads/writes are denied for every
-- role. Only the security-definer trigger (write) and security-definer lookup
-- function (read) can access the table, so the directory cannot be scraped.
alter table public.profile_directory enable row level security;

-- Keep the directory projection in sync with the private profile. When a user
-- opts in to discoverability a public row is upserted; otherwise it is removed.
create or replace function public.sync_profile_directory()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display text := coalesce(nullif(btrim(new.full_name), ''), 'Viatik user');
begin
  if new.discoverable then
    insert into public.profile_directory (
      profile_id, viatik_id, display_name, avatar_url, public_handle,
      preferred_currency, preferred_language, discoverable, created_at, updated_at
    ) values (
      new.id, new.viatik_id, v_display, new.avatar_url, new.public_handle,
      new.preferred_currency, new.preferred_language, true, now(), now()
    )
    on conflict (profile_id) do update set
      viatik_id = excluded.viatik_id,
      display_name = excluded.display_name,
      avatar_url = excluded.avatar_url,
      public_handle = excluded.public_handle,
      preferred_currency = excluded.preferred_currency,
      preferred_language = excluded.preferred_language,
      discoverable = true,
      updated_at = now();
  else
    delete from public.profile_directory where profile_id = new.id;
  end if;
  return new;
end;
$$;

create trigger sync_profile_directory_after_write
  after insert or update on public.profiles
  for each row execute function public.sync_profile_directory();

-- Backfill any profiles that are already discoverable (none by default; this
-- future-proofs deployments that opt existing rows in via SQL).
insert into public.profile_directory (
  profile_id, viatik_id, display_name, avatar_url, public_handle,
  preferred_currency, preferred_language, discoverable, created_at, updated_at
)
select
  id, viatik_id, coalesce(nullif(btrim(full_name), ''), 'Viatik user'),
  avatar_url, public_handle, preferred_currency, preferred_language,
  true, now(), now()
from public.profiles
where discoverable
on conflict (profile_id) do update set
  viatik_id = excluded.viatik_id,
  display_name = excluded.display_name,
  avatar_url = excluded.avatar_url,
  public_handle = excluded.public_handle,
  preferred_currency = excluded.preferred_currency,
  preferred_language = excluded.preferred_language,
  discoverable = true,
  updated_at = now();

-- Sliding-window rate limiting for profile lookups, keyed per authenticated user.
create table public.profile_lookup_attempts (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  window_start timestamptz not null default now(),
  attempts integer not null default 0
);

-- Locked down to security-definer access only.
alter table public.profile_lookup_attempts enable row level security;

-- Rate-limited lookup. Accepts only a canonical Viatik ID, reads from the public
-- directory (never the private profiles table), and returns no private fields.
create or replace function public.lookup_profile_for_linking(p_identifier text)
returns table (
  profile_id uuid,
  viatik_id text,
  display_name text,
  avatar_url text,
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

  -- Canonical Viatik ID only; reject raw profile UUIDs and malformed input.
  v_id := upper(trim(p_identifier));
  if v_id !~ '^VTK-[0-9A-F]{16}$' then
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
    pd.profile_id, pd.viatik_id, pd.display_name, pd.avatar_url,
    pd.public_handle, pd.preferred_currency, pd.preferred_language
  from public.profile_directory pd
  where pd.viatik_id = v_id and pd.discoverable
  limit 1;
end;
$$;

revoke all on function public.lookup_profile_for_linking(text) from public;
grant execute on function public.lookup_profile_for_linking(text) to authenticated;
