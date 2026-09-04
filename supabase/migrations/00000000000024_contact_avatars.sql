-- Optional avatar for contacts (an uploaded image URL or a preset data URL).
-- Kept modest in size; no sensitive data.

alter table public.contacts
  add column avatar_url text;

alter table public.contacts
  add constraint contacts_avatar_url_length_chk check (
    avatar_url is null or char_length(avatar_url) <= 2048
  );

-- Re-extend the contact CAS so updates also persist avatar_url (the insert path
-- already picks it up via jsonb_populate_record once the column exists).
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
