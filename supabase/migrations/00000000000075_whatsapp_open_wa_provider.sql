-- WhatsApp dispatch moves from Twilio to a self-hosted open-wa Easy API
-- (.ai/specs/open-wa-setup.md). The pg_net webhook, claim function, and rate
-- limit from migration 73 are unchanged; only the delivery message id is
-- provider-neutral now. open-wa ids look like true_<chat id>_<hex>.

alter table public.whatsapp_deliveries
  rename column twilio_message_sid to provider_message_id;

alter table public.whatsapp_deliveries
  drop constraint if exists whatsapp_deliveries_twilio_message_sid_check;

alter table public.whatsapp_deliveries
  add constraint whatsapp_deliveries_provider_message_id_check
  check (provider_message_id is null or char_length(provider_message_id) <= 200);

-- Parameter names cannot change with create or replace.
drop function if exists public.complete_whatsapp_dispatch(uuid, text, text, text, text, integer);

create function public.complete_whatsapp_dispatch(
  p_notification_id uuid,
  p_status text,
  p_reason text,
  p_provider_message_id text,
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
      provider_message_id = left(p_provider_message_id, 200),
      error_code = left(p_error_code, 32),
      attempts = greatest(0, least(coalesce(p_attempts, 0), 10))
  where notification_id = p_notification_id
    and status = 'processing';
end;
$$;

revoke all on function public.complete_whatsapp_dispatch(uuid, text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.complete_whatsapp_dispatch(uuid, text, text, text, text, integer) to service_role;
