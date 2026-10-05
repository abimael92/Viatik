-- WhatsApp opt-in (spec: .ai/specs/global-whatsapp-dispatcher.md §5.5). Strictly additive.
-- A recipient gets WhatsApp messages only after turning them on in Settings.
-- profiles is read for this flag only; phones still come from trip traveler contacts.

alter table public.profiles
  add column if not exists whatsapp_notifications_enabled boolean not null default false,
  add column if not exists whatsapp_consent_updated_at timestamptz;

-- Server-stamped consent record: clients cannot set or backdate the timestamp.
create or replace function public.stamp_whatsapp_consent()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.whatsapp_consent_updated_at := case when new.whatsapp_notifications_enabled then now() end;
  elsif new.whatsapp_notifications_enabled is distinct from old.whatsapp_notifications_enabled then
    new.whatsapp_consent_updated_at := now();
  else
    new.whatsapp_consent_updated_at := old.whatsapp_consent_updated_at;
  end if;
  return new;
end;
$$;

create trigger profiles_stamp_whatsapp_consent
before insert or update on public.profiles
for each row execute function public.stamp_whatsapp_consent();

revoke all on function public.stamp_whatsapp_consent() from public, anon, authenticated;

-- Same as migration 73, plus the opt-in gate before any delivery is claimed.
create or replace function public.claim_whatsapp_dispatch(p_notification_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notification public.notifications;
  v_trip public.trips;
  v_trip_id uuid;
  v_actor_id uuid;
  v_activity_title text;
  v_amount bigint;
  v_currency text;
  v_actor_name text;
  v_recent_sent integer;
  v_opted_in boolean;
  v_travelers jsonb := '[]'::jsonb;
begin
  select * into v_notification from public.notifications where id = p_notification_id;
  if not found then
    return jsonb_build_object('claimed', false, 'reason', 'not_found');
  end if;

  select p.whatsapp_notifications_enabled into v_opted_in
  from public.profiles p where p.id = v_notification.user_id;

  if not coalesce(v_opted_in, false) then
    insert into public.whatsapp_deliveries (notification_id, recipient_user_id, notification_type, status, reason)
    values (v_notification.id, v_notification.user_id, v_notification.type, 'skipped', 'not_opted_in')
    on conflict (notification_id) do nothing;
    return jsonb_build_object('claimed', false, 'reason', case when found then 'not_opted_in' else 'duplicate' end);
  end if;

  select count(*) into v_recent_sent
  from public.whatsapp_deliveries d
  where d.recipient_user_id = v_notification.user_id
    and d.status = 'sent'
    and d.created_at > now() - interval '24 hours';

  if v_recent_sent >= 20 then
    insert into public.whatsapp_deliveries (notification_id, recipient_user_id, notification_type, status, reason)
    values (v_notification.id, v_notification.user_id, v_notification.type, 'skipped', 'rate_limited')
    on conflict (notification_id) do nothing;
    return jsonb_build_object('claimed', false, 'reason', case when found then 'rate_limited' else 'duplicate' end);
  end if;

  insert into public.whatsapp_deliveries (notification_id, recipient_user_id, notification_type)
  values (v_notification.id, v_notification.user_id, v_notification.type)
  on conflict (notification_id) do nothing;
  if not found then
    return jsonb_build_object('claimed', false, 'reason', 'duplicate');
  end if;

  case v_notification.type::text
    when 'trip_alert', 'trip_added' then
      v_trip_id := v_notification.reference_id;
    when 'trip_invitation' then
      select ti.trip_id, ti.invited_by into v_trip_id, v_actor_id
      from public.trip_invitations ti where ti.id = v_notification.reference_id;
    when 'vote_pending' then
      select a.trip_id, a.title into v_trip_id, v_activity_title
      from public.activities a where a.id = v_notification.reference_id and a.deleted_at is null;
    when 'settlement_recorded' then
      select s.trip_id, s.from_user_id, s.amount::bigint, s.currency into v_trip_id, v_actor_id, v_amount, v_currency
      from public.expense_settlements s where s.id = v_notification.reference_id and s.deleted_at is null;
    when 'settlement_pending' then
      select s.trip_id, s.to_user_id, s.amount::bigint, s.currency into v_trip_id, v_actor_id, v_amount, v_currency
      from public.expense_settlements s where s.id = v_notification.reference_id and s.deleted_at is null;
    when 'friend_request' then
      select cn.requester_id into v_actor_id
      from public.connections cn where cn.id = v_notification.reference_id;
    else
      v_trip_id := null;
  end case;

  if v_actor_id is not null then
    select nullif(btrim(pd.display_name), '') into v_actor_name
    from public.profile_directory pd where pd.profile_id = v_actor_id;
  end if;

  if v_trip_id is not null then
    select * into v_trip from public.trips t where t.id = v_trip_id and t.deleted_at is null;
    if not found then
      v_trip_id := null;
    end if;
  end if;

  if v_trip_id is not null then
    select coalesce(
      jsonb_agg(
        jsonb_build_object('displayName', linked.display_name, 'phone', linked.contact_phone)
        order by linked.is_trip_owner_contact desc, linked.contact_updated_at desc
      ),
      '[]'::jsonb
    )
    into v_travelers
    from (
      select
        tt.display_name,
        c.phone as contact_phone,
        c.owner_id = v_trip.owner_id as is_trip_owner_contact,
        c.updated_at as contact_updated_at
      from public.trip_travelers tt
      join public.contacts c on c.id = tt.contact_id
      where tt.trip_id = v_trip_id
        and tt.deleted_at is null
        and c.deleted_at is null
        and c.linked_profile_id = v_notification.user_id
        and nullif(btrim(c.phone), '') is not null
    ) linked;
  end if;

  return jsonb_build_object(
    'claimed', true,
    'context', jsonb_build_object(
      'notificationId', v_notification.id,
      'userId', v_notification.user_id,
      'type', v_notification.type,
      'message', v_notification.message,
      'tripId', v_trip_id,
      'tripName', case when v_trip_id is null then null else v_trip.name end,
      'activityTitle', v_activity_title,
      'actorName', v_actor_name,
      'amountMinor', v_amount,
      'currency', v_currency,
      'travelers', v_travelers
    )
  );
end;
$$;

revoke all on function public.claim_whatsapp_dispatch(uuid) from public, anon, authenticated;
grant execute on function public.claim_whatsapp_dispatch(uuid) to service_role;
