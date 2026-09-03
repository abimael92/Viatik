alter table public.profiles
  add column viatik_id text,
  add column public_handle text,
  add column preferred_currency text not null default 'USD',
  add column preferred_language text not null default 'en';

-- Existing accounts receive a stable, non-sequential identifier. New identifiers are random.
update public.profiles
set viatik_id = 'VTK-' || upper(substr(md5(id::text), 1, 16))
where viatik_id is null;

alter table public.profiles
  alter column viatik_id set not null,
  alter column viatik_id set default ('VTK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16))),
  add constraint profiles_viatik_id_key unique (viatik_id),
  add constraint profiles_viatik_id_format_chk check (viatik_id ~ '^VTK-[0-9A-F]{16}$'),
  add constraint profiles_public_handle_format_chk check (
    public_handle is null or public_handle ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{2,29}$'
  ),
  add constraint profiles_preferred_currency_chk check (preferred_currency ~ '^[A-Z]{3}$'),
  add constraint profiles_preferred_language_chk check (preferred_language ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$');

create unique index profiles_public_handle_lower_key
  on public.profiles (lower(public_handle))
  where public_handle is not null;

alter type public.contact_relationship add value 'roommate';

drop trigger if exists link_contact_profile_before_write on public.contacts;

alter table public.contacts
  add column linked_avatar_url text,
  add column linked_handle text,
  add column emergency_contact_name text,
  add column emergency_contact_relationship text,
  add column emergency_contact_phone text,
  add column dietary_restrictions text[] not null default '{}',
  add column allergies text[] not null default '{}',
  add column passport_issuing_country text,
  add column passport_expires_on date,
  add column preferred_currency text,
  add column preferred_language text,
  add constraint contacts_linked_handle_length_chk check (
    linked_handle is null or char_length(linked_handle) between 3 and 30
  ),
  add constraint contacts_emergency_name_length_chk check (
    emergency_contact_name is null or char_length(trim(emergency_contact_name)) between 2 and 100
  ),
  add constraint contacts_emergency_relationship_length_chk check (
    emergency_contact_relationship is null or char_length(trim(emergency_contact_relationship)) between 2 and 50
  ),
  add constraint contacts_emergency_phone_length_chk check (
    emergency_contact_phone is null or char_length(trim(emergency_contact_phone)) between 7 and 32
  ),
  add constraint contacts_dietary_restrictions_chk check (
    array_position(dietary_restrictions, null) is null and cardinality(dietary_restrictions) <= 50
  ),
  add constraint contacts_allergies_chk check (
    array_position(allergies, null) is null and cardinality(allergies) <= 50
  ),
  add constraint contacts_passport_country_chk check (
    passport_issuing_country is null or passport_issuing_country ~ '^[A-Z]{2}$'
  ),
  add constraint contacts_preferred_currency_chk check (preferred_currency ~ '^[A-Z]{3}$'),
  add constraint contacts_preferred_language_chk check (preferred_language ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$');

drop policy "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_self_or_shared_trip"
  on public.profiles for select
  to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.trip_members viewer_membership
      join public.trip_members profile_membership
        on profile_membership.trip_id = viewer_membership.trip_id
      join public.trips shared_trip
        on shared_trip.id = viewer_membership.trip_id
      where viewer_membership.user_id = auth.uid()
        and profile_membership.user_id = profiles.id
        and shared_trip.deleted_at is null
    )
  );

create function public.lookup_profile_for_linking(p_identifier text)
returns table (
  profile_id uuid,
  viatik_id text,
  full_name text,
  avatar_url text,
  public_handle text,
  preferred_currency text,
  preferred_language text
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  return query
  select
    p.id,
    p.viatik_id,
    p.full_name,
    p.avatar_url,
    p.public_handle,
    p.preferred_currency,
    p.preferred_language
  from public.profiles p
  where p.viatik_id = upper(trim(p_identifier))
     or p.id::text = trim(p_identifier)
  limit 1;
end;
$$;

revoke all on function public.lookup_profile_for_linking(text) from public;
grant execute on function public.lookup_profile_for_linking(text) to authenticated;

create function public.sync_contact_cas_upsert(
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
