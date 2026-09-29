-- expense_settlements.amount holds minor units. Migration 70 passed it through
-- to_char, so a 5001 minor-unit payment reached the payee as "5001.00".
-- The payload carries the raw minor-unit integer. Clients format it with the
-- currency exponent. Profile contact fields are not copied into the payload.

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
      'amount', new.amount::bigint,
      'currency', new.currency,
      'tripId', new.trip_id
    )::text
  )
  on conflict (user_id, type, reference_id) do nothing;

  return new;
end;
$$;

-- Rows written by migration 70 are rebuilt from their settlement. The stored
-- message is never cast, so a malformed row cannot abort the migration.
update public.notifications n
set message = jsonb_build_object(
  'payerUserId', s.from_user_id,
  'payerName', coalesce(nullif(trim(payer.full_name), ''), '__payer__'),
  'amount', s.amount::bigint,
  'currency', s.currency,
  'tripId', s.trip_id
)::text
from public.expense_settlements s
left join public.profiles payer on payer.id = s.from_user_id
where n.type = 'settlement_recorded'
  and n.reference_id = s.id
  and n.user_id = s.to_user_id;
