drop trigger set_trips_updated_at on public.trips;
create trigger set_trips_updated_at before insert or update on public.trips for each row execute function public.set_updated_at();
drop trigger set_trip_members_updated_at on public.trip_members;
create trigger set_trip_members_updated_at before insert or update on public.trip_members for each row execute function public.set_updated_at();
drop trigger set_trip_invitations_updated_at on public.trip_invitations;
create trigger set_trip_invitations_updated_at before insert or update on public.trip_invitations for each row execute function public.set_updated_at();
drop trigger set_activities_updated_at on public.activities;
create trigger set_activities_updated_at before insert or update on public.activities for each row execute function public.set_updated_at();
drop trigger set_expenses_updated_at on public.expenses;
create trigger set_expenses_updated_at before insert or update on public.expenses for each row execute function public.set_updated_at();
drop trigger set_expense_shares_updated_at on public.expense_shares;
create trigger set_expense_shares_updated_at before insert or update on public.expense_shares for each row execute function public.set_updated_at();
drop trigger set_trip_media_updated_at on public.trip_media;
create trigger set_trip_media_updated_at before insert or update on public.trip_media for each row execute function public.set_updated_at();
drop trigger set_expense_settlements_updated_at on public.expense_settlements;
create trigger set_expense_settlements_updated_at before insert or update on public.expense_settlements for each row execute function public.set_updated_at();
drop trigger set_contacts_updated_at on public.contacts;
create trigger set_contacts_updated_at before insert or update on public.contacts for each row execute function public.set_updated_at();
drop trigger set_trip_travelers_updated_at on public.trip_travelers;
create trigger set_trip_travelers_updated_at before insert or update on public.trip_travelers for each row execute function public.set_updated_at();

create or replace function public.sync_cas_upsert(
  p_entity text,
  p_payload jsonb,
  p_base_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_entity text;
  v_id uuid;
  v_payload jsonb;
  v_current jsonb;
  v_current_updated_at timestamptz;
  v_applied jsonb;
begin
  v_entity := case p_entity
    when 'trip' then 'trips'
    when 'trips' then 'trips'
    when 'tripMember' then 'trip_members'
    when 'trip_members' then 'trip_members'
    when 'invitation' then 'trip_invitations'
    when 'tripInvitation' then 'trip_invitations'
    when 'trip_invitations' then 'trip_invitations'
    when 'activity' then 'activities'
    when 'activities' then 'activities'
    when 'expense' then 'expenses'
    when 'expenses' then 'expenses'
    when 'expenseShare' then 'expense_shares'
    when 'expense_shares' then 'expense_shares'
    when 'media' then 'trip_media'
    when 'tripMedia' then 'trip_media'
    when 'trip_media' then 'trip_media'
    when 'settlement' then 'expense_settlements'
    when 'expenseSettlement' then 'expense_settlements'
    when 'expense_settlements' then 'expense_settlements'
    when 'contact' then 'contacts'
    when 'contacts' then 'contacts'
    when 'tripTraveler' then 'trip_travelers'
    when 'trip_travelers' then 'trip_travelers'
    else null
  end;

  if v_entity is null then
    raise exception 'Unsupported synchronized entity: %', p_entity using errcode = '22023';
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

  perform pg_advisory_xact_lock(hashtextextended(v_entity || ':' || v_id::text, 0));
  v_payload := p_payload - 'updated_at' - 'created_at';

  if v_entity = 'trips' then
    select t.updated_at, to_jsonb(t) into v_current_updated_at, v_current from public.trips t where t.id = v_id for update;
    if not found then
      if p_base_updated_at is not null then return jsonb_build_object('status', 'not_found'); end if;
      insert into public.trips select (jsonb_populate_record(null::public.trips, v_payload || jsonb_build_object('id', v_id, 'created_at', now(), 'updated_at', now()))).*; v_applied := jsonb_build_object('updated_at', now());
    elsif p_base_updated_at is null or v_current_updated_at <> p_base_updated_at then
      return jsonb_build_object('status', 'conflict', 'server_updated_at', v_current_updated_at, 'current', v_current);
    else
      with p as (select jsonb_populate_record(t, v_payload) r from public.trips t where t.id = v_id)
      update public.trips t set owner_id=(p.r).owner_id, name=(p.r).name, description=(p.r).description, destination=(p.r).destination, start_date=(p.r).start_date, end_date=(p.r).end_date, cover_image_url=(p.r).cover_image_url, base_currency=(p.r).base_currency, adult_count=(p.r).adult_count, child_count=(p.r).child_count, deleted_at=(p.r).deleted_at from p where t.id=v_id and t.updated_at=p_base_updated_at returning to_jsonb(t.*) into v_applied;
    end if;
  elsif v_entity = 'trip_members' then
    select t.updated_at, to_jsonb(t) into v_current_updated_at, v_current from public.trip_members t where t.id = v_id for update;
    if not found then
      if p_base_updated_at is not null then return jsonb_build_object('status', 'not_found'); end if;
      insert into public.trip_members select (jsonb_populate_record(null::public.trip_members, v_payload || jsonb_build_object('id', v_id, 'created_at', now(), 'updated_at', now()))).*; v_applied := jsonb_build_object('updated_at', now());
    elsif p_base_updated_at is null or v_current_updated_at <> p_base_updated_at then return jsonb_build_object('status','conflict','server_updated_at',v_current_updated_at,'current',v_current);
    else
      with p as (select jsonb_populate_record(t, v_payload) r from public.trip_members t where t.id=v_id)
      update public.trip_members t set trip_id=(p.r).trip_id, user_id=(p.r).user_id, role=(p.r).role, invited_by=(p.r).invited_by, joined_at=(p.r).joined_at from p where t.id=v_id and t.updated_at=p_base_updated_at returning to_jsonb(t.*) into v_applied;
    end if;
  elsif v_entity = 'trip_invitations' then
    select t.updated_at, to_jsonb(t) into v_current_updated_at, v_current from public.trip_invitations t where t.id = v_id for update;
    if not found then
      if p_base_updated_at is not null then return jsonb_build_object('status', 'not_found'); end if;
      insert into public.trip_invitations select (jsonb_populate_record(null::public.trip_invitations, v_payload || jsonb_build_object('id', v_id, 'created_at', now(), 'updated_at', now()))).*; v_applied := jsonb_build_object('updated_at', now());
    elsif p_base_updated_at is null or v_current_updated_at <> p_base_updated_at then return jsonb_build_object('status','conflict','server_updated_at',v_current_updated_at,'current',v_current);
    else
      with p as (select jsonb_populate_record(t, v_payload) r from public.trip_invitations t where t.id=v_id)
      update public.trip_invitations t set trip_id=(p.r).trip_id, email=(p.r).email, role=(p.r).role, status=(p.r).status, invited_by=(p.r).invited_by, invited_user_id=(p.r).invited_user_id, expires_at=(p.r).expires_at from p where t.id=v_id and t.updated_at=p_base_updated_at returning to_jsonb(t.*) into v_applied;
    end if;
  elsif v_entity = 'activities' then
    select t.updated_at, to_jsonb(t) into v_current_updated_at, v_current from public.activities t where t.id = v_id for update;
    if not found then
      if p_base_updated_at is not null then return jsonb_build_object('status', 'not_found'); end if;
      insert into public.activities select (jsonb_populate_record(null::public.activities, v_payload || jsonb_build_object('id', v_id, 'created_at', now(), 'updated_at', now()))).*; v_applied := jsonb_build_object('updated_at', now());
    elsif p_base_updated_at is null or v_current_updated_at <> p_base_updated_at then return jsonb_build_object('status','conflict','server_updated_at',v_current_updated_at,'current',v_current);
    else
      with p as (select jsonb_populate_record(t, v_payload) r from public.activities t where t.id=v_id)
      update public.activities t set trip_id=(p.r).trip_id, day_date=(p.r).day_date, title=(p.r).title, description=(p.r).description, location=(p.r).location, category=(p.r).category, start_time=(p.r).start_time, end_time=(p.r).end_time, position=(p.r).position, created_by=(p.r).created_by, deleted_at=(p.r).deleted_at from p where t.id=v_id and t.updated_at=p_base_updated_at returning to_jsonb(t.*) into v_applied;
    end if;
  elsif v_entity = 'expenses' then
    select t.updated_at, to_jsonb(t) into v_current_updated_at, v_current from public.expenses t where t.id = v_id for update;
    if not found then
      if p_base_updated_at is not null then return jsonb_build_object('status', 'not_found'); end if;
      insert into public.expenses select (jsonb_populate_record(null::public.expenses, v_payload || jsonb_build_object('id', v_id, 'created_at', now(), 'updated_at', now()))).*; v_applied := jsonb_build_object('updated_at', now());
    elsif p_base_updated_at is null or v_current_updated_at <> p_base_updated_at then return jsonb_build_object('status','conflict','server_updated_at',v_current_updated_at,'current',v_current);
    else
      with p as (select jsonb_populate_record(t, v_payload) r from public.expenses t where t.id=v_id)
      update public.expenses t set trip_id=(p.r).trip_id, activity_id=(p.r).activity_id, description=(p.r).description, amount=(p.r).amount, currency=(p.r).currency, paid_by=(p.r).paid_by, split_type=(p.r).split_type, created_by=(p.r).created_by, deleted_at=(p.r).deleted_at from p where t.id=v_id and t.updated_at=p_base_updated_at returning to_jsonb(t.*) into v_applied;
    end if;
  elsif v_entity = 'expense_shares' then
    select t.updated_at, to_jsonb(t) into v_current_updated_at, v_current from public.expense_shares t where t.id = v_id for update;
    if not found then
      if p_base_updated_at is not null then return jsonb_build_object('status', 'not_found'); end if;
      insert into public.expense_shares select (jsonb_populate_record(null::public.expense_shares, v_payload || jsonb_build_object('id', v_id, 'created_at', now(), 'updated_at', now()))).*; v_applied := jsonb_build_object('updated_at', now());
    elsif p_base_updated_at is null or v_current_updated_at <> p_base_updated_at then return jsonb_build_object('status','conflict','server_updated_at',v_current_updated_at,'current',v_current);
    else
      with p as (select jsonb_populate_record(t, v_payload) r from public.expense_shares t where t.id=v_id)
      update public.expense_shares t set expense_id=(p.r).expense_id, user_id=(p.r).user_id, share_amount=(p.r).share_amount, share_percentage=(p.r).share_percentage from p where t.id=v_id and t.updated_at=p_base_updated_at returning to_jsonb(t.*) into v_applied;
    end if;
  elsif v_entity = 'trip_media' then
    select t.updated_at, to_jsonb(t) into v_current_updated_at, v_current from public.trip_media t where t.id = v_id for update;
    if not found then
      if p_base_updated_at is not null then return jsonb_build_object('status', 'not_found'); end if;
      insert into public.trip_media select (jsonb_populate_record(null::public.trip_media, v_payload || jsonb_build_object('id', v_id, 'created_at', now(), 'updated_at', now()))).*; v_applied := jsonb_build_object('updated_at', now());
    elsif p_base_updated_at is null or v_current_updated_at <> p_base_updated_at then return jsonb_build_object('status','conflict','server_updated_at',v_current_updated_at,'current',v_current);
    else
      with p as (select jsonb_populate_record(t, v_payload) r from public.trip_media t where t.id=v_id)
      update public.trip_media t set trip_id=(p.r).trip_id, activity_id=(p.r).activity_id, caption=(p.r).caption, storage_path=(p.r).storage_path, content_type=(p.r).content_type, byte_size=(p.r).byte_size, created_by=(p.r).created_by, deleted_at=(p.r).deleted_at from p where t.id=v_id and t.updated_at=p_base_updated_at returning to_jsonb(t.*) into v_applied;
    end if;
  elsif v_entity = 'expense_settlements' then
    select t.updated_at, to_jsonb(t) into v_current_updated_at, v_current from public.expense_settlements t where t.id = v_id for update;
    if not found then
      if p_base_updated_at is not null then return jsonb_build_object('status', 'not_found'); end if;
      insert into public.expense_settlements select (jsonb_populate_record(null::public.expense_settlements, v_payload || jsonb_build_object('id', v_id, 'created_at', now(), 'updated_at', now()))).*; v_applied := jsonb_build_object('updated_at', now());
    elsif p_base_updated_at is null or v_current_updated_at <> p_base_updated_at then return jsonb_build_object('status','conflict','server_updated_at',v_current_updated_at,'current',v_current);
    else
      with p as (select jsonb_populate_record(t, v_payload) r from public.expense_settlements t where t.id=v_id)
      update public.expense_settlements t set trip_id=(p.r).trip_id, from_user_id=(p.r).from_user_id, to_user_id=(p.r).to_user_id, amount=(p.r).amount, currency=(p.r).currency, created_by=(p.r).created_by, deleted_at=(p.r).deleted_at from p where t.id=v_id and t.updated_at=p_base_updated_at returning to_jsonb(t.*) into v_applied;
    end if;
  elsif v_entity = 'contacts' then
    select t.updated_at, to_jsonb(t) into v_current_updated_at, v_current from public.contacts t where t.id = v_id for update;
    if not found then
      if p_base_updated_at is not null then return jsonb_build_object('status', 'not_found'); end if;
      insert into public.contacts select (jsonb_populate_record(null::public.contacts, v_payload || jsonb_build_object('id', v_id, 'created_at', now(), 'updated_at', now()))).*; v_applied := jsonb_build_object('updated_at', now());
    elsif p_base_updated_at is null or v_current_updated_at <> p_base_updated_at then return jsonb_build_object('status','conflict','server_updated_at',v_current_updated_at,'current',v_current);
    else
      with p as (select jsonb_populate_record(t, v_payload) r from public.contacts t where t.id=v_id)
      update public.contacts t set owner_id=(p.r).owner_id, full_name=(p.r).full_name, email=(p.r).email, phone=(p.r).phone, linked_profile_id=(p.r).linked_profile_id, relationship=(p.r).relationship, traveler_type=(p.r).traveler_type, birth_date=(p.r).birth_date, notes=(p.r).notes, deleted_at=(p.r).deleted_at from p where t.id=v_id and t.updated_at=p_base_updated_at returning to_jsonb(t.*) into v_applied;
    end if;
  elsif v_entity = 'trip_travelers' then
    select t.updated_at, to_jsonb(t) into v_current_updated_at, v_current from public.trip_travelers t where t.id = v_id for update;
    if not found then
      if p_base_updated_at is not null then return jsonb_build_object('status', 'not_found'); end if;
      insert into public.trip_travelers select (jsonb_populate_record(null::public.trip_travelers, v_payload || jsonb_build_object('id', v_id, 'created_at', now(), 'updated_at', now()))).*; v_applied := jsonb_build_object('updated_at', now());
    elsif p_base_updated_at is null or v_current_updated_at <> p_base_updated_at then return jsonb_build_object('status','conflict','server_updated_at',v_current_updated_at,'current',v_current);
    else
      with p as (select jsonb_populate_record(t, v_payload) r from public.trip_travelers t where t.id=v_id)
      update public.trip_travelers t set trip_id=(p.r).trip_id, contact_id=(p.r).contact_id, display_name=(p.r).display_name, traveler_type=(p.r).traveler_type, created_by=(p.r).created_by, deleted_at=(p.r).deleted_at from p where t.id=v_id and t.updated_at=p_base_updated_at returning to_jsonb(t.*) into v_applied;
    end if;
  end if;

  if v_applied is null then
    return jsonb_build_object('status', 'conflict', 'server_updated_at', v_current_updated_at, 'current', v_current);
  end if;
  return jsonb_build_object('status', 'applied', 'server_updated_at', v_applied -> 'updated_at', 'current', v_applied);
exception when unique_violation then
  v_current := null;
  if v_entity = 'trips' then select to_jsonb(t) into v_current from public.trips t where id=v_id;
  elsif v_entity = 'trip_members' then select to_jsonb(t) into v_current from public.trip_members t where id=v_id;
  elsif v_entity = 'trip_invitations' then select to_jsonb(t) into v_current from public.trip_invitations t where id=v_id;
  elsif v_entity = 'activities' then select to_jsonb(t) into v_current from public.activities t where id=v_id;
  elsif v_entity = 'expenses' then select to_jsonb(t) into v_current from public.expenses t where id=v_id;
  elsif v_entity = 'expense_shares' then select to_jsonb(t) into v_current from public.expense_shares t where id=v_id;
  elsif v_entity = 'trip_media' then select to_jsonb(t) into v_current from public.trip_media t where id=v_id;
  elsif v_entity = 'expense_settlements' then select to_jsonb(t) into v_current from public.expense_settlements t where id=v_id;
  elsif v_entity = 'contacts' then select to_jsonb(t) into v_current from public.contacts t where id=v_id;
  elsif v_entity = 'trip_travelers' then select to_jsonb(t) into v_current from public.trip_travelers t where id=v_id;
  end if;
  return jsonb_build_object('status', 'conflict', 'server_updated_at', v_current -> 'updated_at', 'current', v_current);
end;
$$;

create or replace function public.sync_cas_delete(
  p_entity text,
  p_id uuid,
  p_base_updated_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_entity text;
  v_current jsonb;
  v_current_updated_at timestamptz;
begin
  if p_id is null or p_base_updated_at is null then
    raise exception 'p_id and p_base_updated_at are required' using errcode = '22023';
  end if;
  v_entity := case p_entity
    when 'trip' then 'trips' when 'trips' then 'trips'
    when 'tripMember' then 'trip_members' when 'trip_members' then 'trip_members'
    when 'invitation' then 'trip_invitations' when 'tripInvitation' then 'trip_invitations' when 'trip_invitations' then 'trip_invitations'
    when 'activity' then 'activities' when 'activities' then 'activities'
    when 'expense' then 'expenses' when 'expenses' then 'expenses'
    when 'expenseShare' then 'expense_shares' when 'expense_shares' then 'expense_shares'
    when 'media' then 'trip_media' when 'tripMedia' then 'trip_media' when 'trip_media' then 'trip_media'
    when 'settlement' then 'expense_settlements' when 'expenseSettlement' then 'expense_settlements' when 'expense_settlements' then 'expense_settlements'
    when 'contact' then 'contacts' when 'contacts' then 'contacts'
    when 'tripTraveler' then 'trip_travelers' when 'trip_travelers' then 'trip_travelers'
    else null
  end;
  if v_entity is null then raise exception 'Unsupported synchronized entity: %', p_entity using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_entity || ':' || p_id::text, 0));
  if v_entity = 'trips' then select updated_at,to_jsonb(t) into v_current_updated_at,v_current from public.trips t where id=p_id for update;
  elsif v_entity = 'trip_members' then select updated_at,to_jsonb(t) into v_current_updated_at,v_current from public.trip_members t where id=p_id for update;
  elsif v_entity = 'trip_invitations' then select updated_at,to_jsonb(t) into v_current_updated_at,v_current from public.trip_invitations t where id=p_id for update;
  elsif v_entity = 'activities' then select updated_at,to_jsonb(t) into v_current_updated_at,v_current from public.activities t where id=p_id for update;
  elsif v_entity = 'expenses' then select updated_at,to_jsonb(t) into v_current_updated_at,v_current from public.expenses t where id=p_id for update;
  elsif v_entity = 'expense_shares' then select updated_at,to_jsonb(t) into v_current_updated_at,v_current from public.expense_shares t where id=p_id for update;
  elsif v_entity = 'trip_media' then select updated_at,to_jsonb(t) into v_current_updated_at,v_current from public.trip_media t where id=p_id for update;
  elsif v_entity = 'expense_settlements' then select updated_at,to_jsonb(t) into v_current_updated_at,v_current from public.expense_settlements t where id=p_id for update;
  elsif v_entity = 'contacts' then select updated_at,to_jsonb(t) into v_current_updated_at,v_current from public.contacts t where id=p_id for update;
  elsif v_entity = 'trip_travelers' then select updated_at,to_jsonb(t) into v_current_updated_at,v_current from public.trip_travelers t where id=p_id for update;
  end if;

  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if v_current_updated_at <> p_base_updated_at then
    return jsonb_build_object('status', 'conflict', 'server_updated_at', v_current_updated_at, 'current', v_current);
  end if;

  if v_entity = 'trips' then delete from public.trips where id=p_id and updated_at=p_base_updated_at;
  elsif v_entity = 'trip_members' then delete from public.trip_members where id=p_id and updated_at=p_base_updated_at;
  elsif v_entity = 'trip_invitations' then delete from public.trip_invitations where id=p_id and updated_at=p_base_updated_at;
  elsif v_entity = 'activities' then delete from public.activities where id=p_id and updated_at=p_base_updated_at;
  elsif v_entity = 'expenses' then delete from public.expenses where id=p_id and updated_at=p_base_updated_at;
  elsif v_entity = 'expense_shares' then delete from public.expense_shares where id=p_id and updated_at=p_base_updated_at;
  elsif v_entity = 'trip_media' then delete from public.trip_media where id=p_id and updated_at=p_base_updated_at;
  elsif v_entity = 'expense_settlements' then delete from public.expense_settlements where id=p_id and updated_at=p_base_updated_at;
  elsif v_entity = 'contacts' then delete from public.contacts where id=p_id and updated_at=p_base_updated_at;
  elsif v_entity = 'trip_travelers' then delete from public.trip_travelers where id=p_id and updated_at=p_base_updated_at;
  end if;
  if not found then return jsonb_build_object('status','conflict','server_updated_at',v_current_updated_at,'current',v_current); end if;
  return jsonb_build_object('status', 'applied', 'server_updated_at', v_current_updated_at, 'current', v_current);
end;
$$;

revoke all on function public.sync_cas_upsert(text, jsonb, timestamptz) from public;
revoke all on function public.sync_cas_delete(text, uuid, timestamptz) from public;
grant execute on function public.sync_cas_upsert(text, jsonb, timestamptz) to authenticated;
grant execute on function public.sync_cas_delete(text, uuid, timestamptz) to authenticated;
