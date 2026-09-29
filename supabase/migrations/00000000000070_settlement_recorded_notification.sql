-- A settlement row is the recorded repayment. The ledger has no status column.
-- The previous trigger aborted the insert by reading a field that does not exist.
-- Notify the payee after the row exists. The message is a payment payload.
-- Profile contact fields are not copied into that payload.

alter type public.notification_type add value if not exists 'settlement_recorded';

create or replace function public.generate_settlement_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  payer_name text;
begin
  if new.deleted_at is not null then
    return new;
  end if;

  if exists (
    select 1
    from public.profiles recipient
    where recipient.id = new.to_user_id
      and recipient.mute_trip_notifications
      and (localtime >= time '22:00' or localtime < time '08:00')
  ) then
    return new;
  end if;

  select nullif(trim(payer.full_name), '')
  into payer_name
  from public.profiles payer
  where payer.id = new.from_user_id;

  insert into public.notifications (user_id, type, reference_id, message)
  values (
    new.to_user_id,
    'settlement_recorded',
    new.id,
    jsonb_build_object(
      'payerUserId', new.from_user_id,
      'payerName', coalesce(payer_name, '__payer__'),
      'amount', to_char(new.amount, 'FM9999999990.00'),
      'currency', new.currency,
      'tripId', new.trip_id
    )::text
  )
  on conflict (user_id, type, reference_id) do nothing;

  return new;
end;
$$;
