import { callServiceRpc, jsonResponse as respond, rejectUnlessWebhookSecret } from "../_shared/http.ts";
import { buildWhatsAppMessage, isNotificationType, type DispatchContext } from "./messages.ts";
import { parseOpenWaEndpoint, sendOpenWaText, type OpenWaConfig, type OpenWaSendResult } from "./open-wa.ts";
import { maskPhone, normalizeToE164, toWhatsAppChatId } from "./phone.ts";

export interface DispatcherDeps {
  env: (name: string) => string | undefined;
  fetch: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  log?: (entry: Record<string, unknown>) => void;
}

type ClaimResult = { claimed: true; context: DispatchContext } | { claimed: false; reason: string };

type Outcome =
  | { status: "sent"; messageId: string; attempts: number }
  | { status: "failed"; errorCode: string; attempts: number }
  | { status: "skipped"; reason: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 1_000;

/** Accepts the Supabase Database Webhook shape: { type, table, schema, record, old_record }. */
function notificationIdFrom(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const { type, table, record } = payload as { type?: unknown; table?: unknown; record?: { id?: unknown } };
  if (type !== "INSERT" || table !== "notifications") return null;
  const id = record?.id;
  return typeof id === "string" && UUID.test(id) ? id : null;
}

type RecipientResolution =
  | { ok: true; displayName: string; phone: string }
  | { ok: false; reason: "no_phone" | "ambiguous_phone" };

/** Pick one sendable number; contacts that disagree on the number are not guessed between. */
function resolveRecipient(context: DispatchContext, defaultCountryCode: string | undefined): RecipientResolution {
  const candidates = context.travelers.flatMap((traveler) => {
    const phone = normalizeToE164(traveler.phone, defaultCountryCode);
    return phone ? [{ displayName: traveler.displayName, phone }] : [];
  });
  if (!candidates.length) return { ok: false, reason: "no_phone" };
  if (new Set(candidates.map((candidate) => candidate.phone)).size > 1) return { ok: false, reason: "ambiguous_phone" };
  return { ok: true, ...candidates[0] };
}

export function createWhatsAppDispatcher(deps: DispatcherDeps): (request: Request) => Promise<Response> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const log = deps.log ?? (() => undefined);

  const rpc = <T>(name: string, args: Record<string, unknown>) => callServiceRpc<T>(deps.fetch, deps.env, name, args);

  async function send(config: OpenWaConfig, chatId: string, content: string) {
    let attempts = 0;
    let result: OpenWaSendResult;
    do {
      if (attempts > 0) await sleep(RETRY_DELAY_MS);
      attempts += 1;
      result = await sendOpenWaText(deps.fetch, config, { chatId, content });
    } while (!result.ok && result.transient && attempts < MAX_ATTEMPTS);
    return { result, attempts };
  }

  async function deliver(context: DispatchContext, config: OpenWaConfig): Promise<Outcome> {
    if (!isNotificationType(context.type)) return { status: "skipped", reason: "unsupported_type" };
    if (!context.tripId) return { status: "skipped", reason: "no_trip_context" };

    const recipient = resolveRecipient(context, deps.env("WHATSAPP_DEFAULT_COUNTRY_CODE"));
    if (!recipient.ok) return { status: "skipped", reason: recipient.reason };

    const content = buildWhatsAppMessage(context, recipient.displayName, { appUrl: deps.env("VIATIK_APP_URL") });
    if (!content) return { status: "skipped", reason: "missing_details" };

    const { result, attempts } = await send(config, toWhatsAppChatId(recipient.phone), content);
    log({
      event: "whatsapp_dispatch_attempt",
      notificationId: context.notificationId,
      type: context.type,
      to: maskPhone(recipient.phone),
      attempts,
      ok: result.ok,
      errorCode: result.ok ? null : result.errorCode,
    });
    return result.ok
      ? { status: "sent", messageId: result.messageId, attempts }
      : { status: "failed", errorCode: result.errorCode, attempts };
  }

  return async function handle(request: Request): Promise<Response> {
    const rejected = rejectUnlessWebhookSecret(request, deps.env, "WHATSAPP_WEBHOOK_SECRET");
    if (rejected) return rejected;

    const notificationId = notificationIdFrom(await request.json().catch(() => null));
    if (!notificationId) return respond({ status: "error" }, 400);

    const endpoint = parseOpenWaEndpoint(deps.env("OPEN_WA_ENDPOINT"));
    const apiKey = deps.env("OPEN_WA_API_KEY")?.trim() ?? "";
    if (!endpoint || !apiKey) return respond({ status: "skipped", reason: "open_wa_not_configured" });
    const config: OpenWaConfig = { endpoint, apiKey };

    try {
      const claim = await rpc<ClaimResult>("claim_whatsapp_dispatch", { p_notification_id: notificationId });
      if (!claim?.claimed) return respond({ status: "skipped", reason: claim?.reason ?? "not_found" });

      const outcome = await deliver(claim.context, config);
      await rpc("complete_whatsapp_dispatch", {
        p_notification_id: notificationId,
        p_status: outcome.status,
        p_reason: outcome.status === "skipped" ? outcome.reason : null,
        p_provider_message_id: outcome.status === "sent" ? outcome.messageId : null,
        p_error_code: outcome.status === "failed" ? outcome.errorCode : null,
        p_attempts: outcome.status === "skipped" ? 0 : outcome.attempts,
      });

      if (outcome.status === "sent") return respond({ status: "sent" });
      if (outcome.status === "failed") return respond({ status: "failed", errorCode: outcome.errorCode });
      return respond({ status: "skipped", reason: outcome.reason });
    } catch (error) {
      log({
        event: "whatsapp_dispatch_error",
        notificationId,
        error: error instanceof Error ? error.message : "unknown",
      });
      return respond({ status: "error" }, 500);
    }
  };
}
