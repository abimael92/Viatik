-- WhatsApp delivery for notifications (spec: .ai/specs/global-whatsapp-dispatcher.md).
-- Strictly additive. whatsapp_deliveries carries Level B metadata and has no client access.
-- Recipient phones come only from trip traveler contacts; profiles is never read.
--
-- Setup (once per environment, not stored in this migration):
--   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/whatsapp-dispatcher', 'whatsapp_dispatcher_url');
--   select vault.create_secret('<random secret>', 'whatsapp_dispatcher_secret');
-- The same secret is set on the Edge Function as WHATSAPP_WEBHOOK_SECRET.

create extension if not exists pg_net with schema extensions;

create table public.whatsapp_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null unique references public.notifications (id) on delete cascade,
  recipient_user_id uuid not null references public.profiles (id) on delete cascade,
  notification_type public.notification_type not null,
  status text not null default 'processing' check (status in ('processing', 'sent', 'failed', 'skipped')),
  reason text check (reason is null or char_length(reason) <= 64),
  error_code text check (error_code is null or char_length(error_code) <= 32),
  twilio_message_sid text check (twilio_message_sid is null or twilio_message_sid ~ '^(SM|MM)[0-9a-fA-F]{32}$'),
  attempts integer not null default 0 check (attempts between 0 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0)
);

create index whatsapp_deliveries_recipient_sent_idx
  on public.whatsapp_deliveries (recipient_user_id, created_at desc)
  where status = 'sent';

alter table public.whatsapp_deliveries enable row level security;
revoke all on public.whatsapp_deliveries from public, anon, authenticated;

create trigger whatsapp_deliveries_touch_updated_at
before update on public.whatsapp_deliveries
for each row execute function public.touch_notification_updated_at();

-- Claims a notification for delivery exactly once and returns the allow-listed
-- context the Edge Function needs. Phones come from contacts linked to the
-- recipient that are attached as travelers on the notification's trip.
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
  v_travelers jsonb := '[]'::jsonb;
begin
  select * into v_notification from public.notifications where id = p_notification_id;
  if not found then
    return jsonb_build_object('claimed', false, 'reason', 'not_found');
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

create or replace function public.complete_whatsapp_dispatch(
  p_notification_id uuid,
  p_status text,
  p_reason text,
  p_twilio_message_sid text,
  p_error_code text,
  p_attempts integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('sent', 'failed', 'skipped') then
    raise exception 'Invalid WhatsApp delivery status' using errcode = '22023';
  end if;

  update public.whatsapp_deliveries
  set status = p_status,
      reason = left(p_reason, 64),
      twilio_message_sid = p_twilio_message_sid,
      error_code = left(p_error_code, 32),
      attempts = greatest(0, least(coalesce(p_attempts, 0), 10))
  where notification_id = p_notification_id
    and status = 'processing';
end;
$$;

-- Queues the webhook after the insert commits. The body carries identifiers only;
-- the Edge Function reads everything else through claim_whatsapp_dispatch.
create or replace function public.dispatch_whatsapp_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
begin
  begin
    select ds.decrypted_secret into v_url
    from vault.decrypted_secrets ds where ds.name = 'whatsapp_dispatcher_url';
    select ds.decrypted_secret into v_secret
    from vault.decrypted_secrets ds where ds.name = 'whatsapp_dispatcher_secret';

    if v_url is null or v_secret is null then
      return new;
    end if;

    perform net.http_post(
      url := v_url,
      body := jsonb_build_object(
        'type', 'INSERT',
        'table', 'notifications',
        'schema', 'public',
        'record', jsonb_build_object('id', new.id, 'type', new.type),
        'old_record', null
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-viatik-webhook-secret', v_secret
      ),
      timeout_milliseconds := 5000
    );
  exception when others then
    raise warning 'WhatsApp dispatch could not be queued for notification % (SQLSTATE %)', new.id, sqlstate;
  end;

  return new;
end;
$$;

create trigger notifications_dispatch_whatsapp
after insert on public.notifications
for each row execute function public.dispatch_whatsapp_notification();

revoke all on function public.claim_whatsapp_dispatch(uuid) from public, anon, authenticated;
revoke all on function public.complete_whatsapp_dispatch(uuid, text, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.dispatch_whatsapp_notification() from public, anon, authenticated;
grant execute on function public.claim_whatsapp_dispatch(uuid) to service_role;
grant execute on function public.complete_whatsapp_dispatch(uuid, text, text, text, text, integer) to service_role;
