export interface OpenWaConfig {
  /** Base URL of the self-hosted Easy API, e.g. https://wa.example.com (no /api suffix). */
  endpoint: string;
  apiKey: string;
}

export type OpenWaSendResult =
  | { ok: true; messageId: string }
  | { ok: false; errorCode: string; transient: boolean };

/** open-wa drives a real browser session, so a send can take several seconds. */
const TIMEOUT_MS = 15_000;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const MESSAGE_ID = /^(true|false)_.+_.+$/;

/**
 * Parse OPEN_WA_ENDPOINT. The API key travels in a header, so remote hosts
 * must use HTTPS; plain HTTP is allowed only for local development.
 */
export function parseOpenWaEndpoint(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname))) return null;
  return url.toString().replace(/\/+$/, "").replace(/\/api$/, "");
}

/** Easy API returns the id as a string, or as an object with `_serialized`. */
function messageIdFrom(data: unknown): string | null {
  const value = data && typeof data === "object" ? (data as { _serialized?: unknown })._serialized : data;
  return typeof value === "string" && MESSAGE_ID.test(value) ? value : null;
}

/** Non-id results are statuses such as "Not a contact" (unlicensed send to a non-contact). */
function statusCode(data: unknown): string {
  if (typeof data !== "string") return "not_sent";
  const code = data.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return code ? code.slice(0, 32) : "not_sent";
}

/** POST {endpoint}/api/messages/sendText with `{ to, content }` (open-wa Easy API v5). */
export async function sendOpenWaText(
  fetchImpl: typeof fetch,
  config: OpenWaConfig,
  message: { chatId: string; content: string },
): Promise<OpenWaSendResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(`${config.endpoint}/api/messages/sendText`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": config.apiKey },
      body: JSON.stringify({ to: message.chatId, content: message.content }),
      signal: controller.signal,
    });
    const body = (await response.json().catch(() => ({}))) as { success?: unknown; data?: unknown };
    if (!response.ok) {
      return { ok: false, errorCode: `http_${response.status}`, transient: response.status === 429 || response.status >= 500 };
    }
    const messageId = body.success === false ? null : messageIdFrom(body.data);
    return messageId ? { ok: true, messageId } : { ok: false, errorCode: statusCode(body.data), transient: false };
  } catch {
    // A timed-out send may still be delivered, so it is not retried.
    if (controller.signal.aborted) return { ok: false, errorCode: "timeout", transient: false };
    return { ok: false, errorCode: "network", transient: true };
  } finally {
    clearTimeout(timeout);
  }
}
