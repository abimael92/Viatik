-- DiceBear avatar seeds for playful, deterministic avatars. A seed is a short
-- string (optionally "style|seed") that deterministically generates a vector
-- avatar on the client; an uploaded image may still take precedence (avatar_url).

alter table public.profiles
  add column avatar_seed text;

alter table public.profile_directory
  add column avatar_seed text;

-- Keep the directory's avatar seed in sync with the private profile.
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
      profile_id, viatik_id, display_name, avatar_url, avatar_seed, public_handle,
      preferred_currency, preferred_language, discoverable, created_at, updated_at
    ) values (
      new.id, new.viatik_id, v_display, new.avatar_url, new.avatar_seed, new.public_handle,
      new.preferred_currency, new.preferred_language, true, now(), now()
    )
    on conflict (profile_id) do update set
      viatik_id = excluded.viatik_id,
      display_name = excluded.display_name,
      avatar_url = excluded.avatar_url,
      avatar_seed = excluded.avatar_seed,
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

-- Backfill any already-discoverable profiles.
insert into public.profile_directory (
  profile_id, viatik_id, display_name, avatar_url, avatar_seed, public_handle,
  preferred_currency, preferred_language, discoverable, created_at, updated_at
)
select
  id, viatik_id, coalesce(nullif(btrim(full_name), ''), 'Viatik user'),
  avatar_url, avatar_seed, public_handle, preferred_currency, preferred_language,
  true, now(), now()
from public.profiles
where discoverable
on conflict (profile_id) do update set
  avatar_url = excluded.avatar_url,
  avatar_seed = excluded.avatar_seed,
  updated_at = now();

-- Rate-limited lookup now also returns the avatar seed for linked contacts.
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

  v_id := upper(trim(p_identifier));
  if v_id !~ '^VTK-[0-9A-F]{16}$' then
    raise exception 'Invalid Viatik ID' using errcode = '22023';
  end if;

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
  where pd.viatik_id = v_id and pd.discoverable
  limit 1;
end;
$$;

revoke all on function public.lookup_profile_for_linking(text) from public;
grant execute on function public.lookup_profile_for_linking(text) to authenticated;

-- Persist avatar_seed on contact updates too.
create or replace function public.sync_contact_cas_upsert(
  p_payload jsonb,
  p_base_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_payload jsonb;
  v_current jsonb;
  v_current_updated_at timestamptz;
  v_applied jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'p_payload must be a JSON object' using errcode = '22023';
  end if;

  begin
    v_id := (p_payload ->> 'id')::uuid;
  exception when invalid_text_representation then
    raise exception 'p_payload.id must be a UUID' using errcode = '22023';
  end;
  if v_id is null then
    raise exception 'p_payload.id is required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('contacts:' || v_id::text, 0));
  v_payload := p_payload - 'updated_at' - 'created_at';

  select c.updated_at, to_jsonb(c)
  into v_current_updated_at, v_current
  from public.contacts c
  where c.id = v_id
  for update;

  if not found then
    if p_base_updated_at is not null then
      return jsonb_build_object('status', 'not_found');
    end if;
    insert into public.contacts
    select (jsonb_populate_record(
      null::public.contacts,
      v_payload || jsonb_build_object('id', v_id, 'created_at', now(), 'updated_at', now())
    )).*
    returning to_jsonb(contacts.*) into v_applied;
  elsif p_base_updated_at is null or v_current_updated_at <> p_base_updated_at then
    return jsonb_build_object(
      'status', 'conflict',
      'server_updated_at', v_current_updated_at,
      'current', v_current
    );
  else
    with payload as (
      select jsonb_populate_record(c, v_payload) as row
      from public.contacts c
      where c.id = v_id
    )
    update public.contacts c
    set owner_id = (payload.row).owner_id,
        full_name = (payload.row).full_name,
        avatar_url = (payload.row).avatar_url,
        avatar_seed = (payload.row).avatar_seed,
        email = (payload.row).email,
        phone = (payload.row).phone,
        linked_profile_id = (payload.row).linked_profile_id,
        relationship = (payload.row).relationship,
        traveler_type = (payload.row).traveler_type,
        birth_date = (payload.row).birth_date,
        notes = (payload.row).notes,
        linked_avatar_url = (payload.row).linked_avatar_url,
        linked_handle = (payload.row).linked_handle,
        emergency_contact_name = (payload.row).emergency_contact_name,
        emergency_contact_relationship = (payload.row).emergency_contact_relationship,
        emergency_contact_phone = (payload.row).emergency_contact_phone,
        dietary_restrictions = (payload.row).dietary_restrictions,
        allergies = (payload.row).allergies,
        passport_issuing_country = (payload.row).passport_issuing_country,
        passport_expires_on = (payload.row).passport_expires_on,
        preferred_currency = (payload.row).preferred_currency,
        preferred_language = (payload.row).preferred_language,
        deleted_at = (payload.row).deleted_at
    from payload
    where c.id = v_id
      and c.updated_at = p_base_updated_at
    returning to_jsonb(c.*) into v_applied;
  end if;

  if v_applied is null then
    return jsonb_build_object(
      'status', 'conflict',
      'server_updated_at', v_current_updated_at,
      'current', v_current
    );
  end if;
  return jsonb_build_object(
    'status', 'applied',
    'server_updated_at', v_applied -> 'updated_at',
    'current', v_applied
  );
exception when unique_violation then
  select to_jsonb(c) into v_current
  from public.contacts c
  where c.id = v_id;
  return jsonb_build_object(
    'status', 'conflict',
    'server_updated_at', v_current -> 'updated_at',
    'current', v_current
  );
end;
$$;

revoke all on function public.sync_contact_cas_upsert(jsonb, timestamptz) from public;
grant execute on function public.sync_contact_cas_upsert(jsonb, timestamptz) to authenticated;
