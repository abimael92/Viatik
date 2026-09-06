-- Offline Maps & Location Pinning: add geocoordinates to itinerary activities.
--
-- `activities.latitude`/`activities.longitude` let itinerary items be plotted
-- on the trip map. The CAS upsert is recreated to include the new columns in
-- the activity UPDATE branch; the INSERT path already maps all payload keys via
-- jsonb_populate_record. Dropped pins live in a device-local Dexie table (see
-- the `tripPins` schema version) and are intentionally not synced here.

alter table public.activities add column latitude double precision;
alter table public.activities add column longitude double precision;

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
    when 'userWallet' then 'user_wallets'
    when 'user_wallets' then 'user_wallets'
    when 'dailyBudgetOverride' then 'daily_budget_overrides'
    when 'daily_budget_overrides' then 'daily_budget_overrides'
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
      update public.trips t set owner_id=(p.r).owner_id, name=(p.r).name, description=(p.r).description, destination=(p.r).destination, start_date=(p.r).start_date, end_date=(p.r).end_date, cover_image_url=(p.r).cover_image_url, base_currency=(p.r).base_currency, adult_count=(p.r).adult_count, child_count=(p.r).child_count, total_budget=(p.r).total_budget, deleted_at=(p.r).deleted_at from p where t.id=v_id and t.updated_at=p_base_updated_at returning to_jsonb(t.*) into v_applied;
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
      update public.activities t set trip_id=(p.r).trip_id, day_date=(p.r).day_date, title=(p.r).title, description=(p.r).description, location=(p.r).location, latitude=(p.r).latitude, longitude=(p.r).longitude, category=(p.r).category, start_time=(p.r).start_time, end_time=(p.r).end_time, position=(p.r).position, estimated_cost=(p.r).estimated_cost, created_by=(p.r).created_by, deleted_at=(p.r).deleted_at from p where t.id=v_id and t.updated_at=p_base_updated_at returning to_jsonb(t.*) into v_applied;
    end if;
  elsif v_entity = 'expenses' then
    select t.updated_at, to_jsonb(t) into v_current_updated_at, v_current from public.expenses t where t.id = v_id for update;
    if not found then
      if p_base_updated_at is not null then return jsonb_build_object('status', 'not_found'); end if;
      insert into public.expenses select (jsonb_populate_record(null::public.expenses, v_payload || jsonb_build_object('id', v_id, 'created_at', now(), 'updated_at', now()))).*; v_applied := jsonb_build_object('updated_at', now());
    elsif p_base_updated_at is null or v_current_updated_at <> p_base_updated_at then return jsonb_build_object('status','conflict','server_updated_at',v_current_updated_at,'current',v_current);
    else
      with p as (select jsonb_populate_record(t, v_payload) r from public.expenses t where t.id=v_id)
      update public.expenses t set trip_id=(p.r).trip_id, activity_id=(p.r).activity_id, description=(p.r).description, amount=(p.r).amount, currency=(p.r).currency, exchange_rate_to_base=(p.r).exchange_rate_to_base, paid_by=(p.r).paid_by, split_type=(p.r).split_type, category_id=(p.r).category_id, expense_date=(p.r).expense_date, created_by=(p.r).created_by, deleted_at=(p.r).deleted_at from p where t.id=v_id and t.updated_at=p_base_updated_at returning to_jsonb(t.*) into v_applied;
    end if;
  elsif v_entity = 'expense_shares' then
    select t.updated_at, to_jsonb(t) into v_current_updated_at, v_current from public.expense_shares t where t.id = v_id for update;
    if not found then
      if p_base_updated_at is not null then return jsonb_build_object('status', 'not_found'); end if;
      insert into public.expense_shares select (jsonb_populate_record(null::public.expense_shares, v_payload || jsonb_build_object('id', v_id, 'created_at', now(), 'updated_at', now()))).*; v_applied := jsonb_build_object('updated_at', now());
    elsif p_base_updated_at is null or v_current_updated_at <> p_base_updated_at then return jsonb_build_object('status','conflict','server_updated_at',v_current_updated_at,'current',v_current);
    else
      with p as (select jsonb_populate_record(t, v_payload) r from public.expense_shares t where t.id=v_id)
      update public.expense_shares t set expense_id=(p.r).expense_id, user_id=(p.r).user_id, share_amount=(p.r).share_amount, share_percentage=(p.r).share_percentage, split_type=(p.r).split_type from p where t.id=v_id and t.updated_at=p_base_updated_at returning to_jsonb(t.*) into v_applied;
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
  elsif v_entity = 'user_wallets' then
    select t.updated_at, to_jsonb(t) into v_current_updated_at, v_current from public.user_wallets t where t.id = v_id for update;
    if not found then
      if p_base_updated_at is not null then return jsonb_build_object('status', 'not_found'); end if;
      insert into public.user_wallets select (jsonb_populate_record(null::public.user_wallets, v_payload || jsonb_build_object('id', v_id, 'created_at', now(), 'updated_at', now()))).*; v_applied := jsonb_build_object('updated_at', now());
    elsif p_base_updated_at is null or v_current_updated_at <> p_base_updated_at then return jsonb_build_object('status','conflict','server_updated_at',v_current_updated_at,'current',v_current);
    else
      with p as (select jsonb_populate_record(t, v_payload) r from public.user_wallets t where t.id=v_id)
      update public.user_wallets t set trip_id=(p.r).trip_id, user_id=(p.r).user_id, starting_balance=(p.r).starting_balance, currency=(p.r).currency from p where t.id=v_id and t.updated_at=p_base_updated_at returning to_jsonb(t.*) into v_applied;
    end if;
  elsif v_entity = 'daily_budget_overrides' then
    select t.updated_at, to_jsonb(t) into v_current_updated_at, v_current from public.daily_budget_overrides t where t.id = v_id for update;
    if not found then
      if p_base_updated_at is not null then return jsonb_build_object('status', 'not_found'); end if;
      insert into public.daily_budget_overrides select (jsonb_populate_record(null::public.daily_budget_overrides, v_payload || jsonb_build_object('id', v_id, 'created_at', now(), 'updated_at', now()))).*; v_applied := jsonb_build_object('updated_at', now());
    elsif p_base_updated_at is null or v_current_updated_at <> p_base_updated_at then return jsonb_build_object('status','conflict','server_updated_at',v_current_updated_at,'current',v_current);
    else
      with p as (select jsonb_populate_record(t, v_payload) r from public.daily_budget_overrides t where t.id=v_id)
      update public.daily_budget_overrides t set trip_id=(p.r).trip_id, date=(p.r).date, custom_budget_amount=(p.r).custom_budget_amount from p where t.id=v_id and t.updated_at=p_base_updated_at returning to_jsonb(t.*) into v_applied;
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
  elsif v_entity = 'user_wallets' then select to_jsonb(t) into v_current from public.user_wallets t where id=v_id;
  elsif v_entity = 'daily_budget_overrides' then select to_jsonb(t) into v_current from public.daily_budget_overrides t where id=v_id;
  end if;
  return jsonb_build_object('status', 'conflict', 'server_updated_at', v_current -> 'updated_at', 'current', v_current);
end;
$$;

revoke all on function public.sync_cas_upsert(text, jsonb, timestamptz) from public;
grant execute on function public.sync_cas_upsert(text, jsonb, timestamptz) to authenticated;
