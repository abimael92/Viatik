// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { createWhatsAppDispatcher } from "./dispatcher.ts";

const NOTIFICATION_ID = "11111111-1111-4111-8111-111111111111";
const MESSAGE_ID = "true_16025550123@c.us_3EB0C431C26A1916E07A";

const ENV: Record<string, string> = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  WHATSAPP_WEBHOOK_SECRET: "webhook-secret",
  OPEN_WA_ENDPOINT: "https://wa.example.com/",
  OPEN_WA_API_KEY: "open-wa-key",
};

function context(overrides: Record<string, unknown> = {}) {
  return {
    notificationId: NOTIFICATION_ID,
    userId: "22222222-2222-4222-8222-222222222222",
    type: "trip_added",
    message: "You were added to Cancún 2026",
    tripId: "33333333-3333-4333-8333-333333333333",
    tripName: "Cancún 2026",
    activityTitle: null,
    actorName: null,
    amountMinor: null,
    currency: null,
    travelers: [{ displayName: "Citlalli Ramos", phone: "(602) 555-0123" }],
    ...overrides,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function setup({
  env = ENV,
  claim = { claimed: true, context: context() } as unknown,
  openWa = [json({ success: true, data: MESSAGE_ID })] as Response[],
} = {}) {
  const completions: Record<string, unknown>[] = [];
  const sends: { url: string; init: RequestInit }[] = [];
  const logs: Record<string, unknown>[] = [];
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/rest/v1/rpc/claim_whatsapp_dispatch")) return json(claim);
    if (url.endsWith("/rest/v1/rpc/complete_whatsapp_dispatch")) {
      completions.push(JSON.parse(String(init?.body)));
      return new Response(null, { status: 204 });
    }
    if (url.startsWith("https://wa.example.com/") || url.startsWith("http://localhost:8080/")) {
      sends.push({ url, init: init ?? {} });
      const next = openWa.shift();
      if (!next) throw new TypeError("network down");
      return next;
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
  const handler = createWhatsAppDispatcher({
    env: (name) => env[name],
    fetch: fetchMock as typeof fetch,
    sleep: async () => undefined,
    log: (entry) => logs.push(entry),
  });
  return { handler, fetchMock, completions, sends, logs };
}

function webhook(body: unknown = { type: "INSERT", table: "notifications", schema: "public", record: { id: NOTIFICATION_ID, type: "trip_added" }, old_record: null }, secret = "webhook-secret") {
  return new Request("https://project.supabase.co/functions/v1/whatsapp-dispatcher", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-viatik-webhook-secret": secret },
    body: JSON.stringify(body),
  });
}

describe("whatsapp-dispatcher", () => {
  it("sends a free-form message to the traveler's WhatsApp chat id and records the message id", async () => {
    const { handler, sends, completions, fetchMock } = setup();

    const response = await handler(webhook());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "sent" });
    const claimCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith("claim_whatsapp_dispatch"));
    expect(JSON.parse(String(claimCall?.[1]?.body))).toEqual({ p_notification_id: NOTIFICATION_ID });
    expect(new Headers(claimCall?.[1]?.headers).get("authorization")).toBe("Bearer service-role-key");

    expect(sends).toHaveLength(1);
    expect(sends[0].url).toBe("https://wa.example.com/api/messages/sendText");
    expect(sends[0].init.method).toBe("POST");
    const headers = new Headers(sends[0].init.headers);
    expect(headers.get("x-api-key")).toBe("open-wa-key");
    expect(headers.get("content-type")).toBe("application/json");
    expect(JSON.parse(String(sends[0].init.body))).toEqual({
      to: "16025550123@c.us",
      content: 'Hi Citlalli! You were added to the trip "Cancún 2026" on Viatik.\n\nOpen Viatik to see the details.',
    });

    expect(completions).toEqual([{
      p_notification_id: NOTIFICATION_ID,
      p_status: "sent",
      p_reason: null,
      p_provider_message_id: MESSAGE_ID,
      p_error_code: null,
      p_attempts: 1,
    }]);
  });

  it("rejects requests without the shared webhook secret before touching the database", async () => {
    const { handler, fetchMock } = setup();

    const response = await handler(webhook(undefined, "wrong"));

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses to run when the webhook secret is not configured", async () => {
    const { handler, fetchMock } = setup({ env: { ...ENV, WHATSAPP_WEBHOOK_SECRET: "" } });

    expect((await handler(webhook())).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores payloads that are not notification inserts", async () => {
    const { handler, fetchMock } = setup();

    const response = await handler(webhook({ type: "UPDATE", table: "notifications", record: { id: NOTIFICATION_ID } }));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["missing key", { OPEN_WA_API_KEY: "" }],
    ["missing endpoint", { OPEN_WA_ENDPOINT: "" }],
    ["plain-http remote endpoint", { OPEN_WA_ENDPOINT: "http://wa.example.com" }],
    ["invalid endpoint", { OPEN_WA_ENDPOINT: "not a url" }],
  ])("skips without claiming when open-wa has a %s", async (_label, overrides) => {
    const { handler, fetchMock } = setup({ env: { ...ENV, ...overrides } });

    const response = await handler(webhook());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "skipped", reason: "open_wa_not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows a plain-http endpoint on localhost and tolerates a trailing /api", async () => {
    const { handler, sends } = setup({ env: { ...ENV, OPEN_WA_ENDPOINT: "http://localhost:8080/api/" } });

    expect(await (await handler(webhook())).json()).toEqual({ status: "sent" });
    expect(sends[0].url).toBe("http://localhost:8080/api/messages/sendText");
  });

  it.each(["duplicate", "not_opted_in"])("sends nothing when the claim is refused as %s", async (reason) => {
    const { handler, sends, completions } = setup({ claim: { claimed: false, reason } });

    const response = await handler(webhook());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "skipped", reason });
    expect(sends).toHaveLength(0);
    expect(completions).toHaveLength(0);
  });

  it.each([
    ["no_trip_context", { type: "friend_request", tripId: null, tripName: null }],
    ["no_trip_context", { tripId: null }],
    ["unsupported_type", { type: "itinerary_updated" }],
    ["no_phone", { travelers: [] }],
    ["no_phone", { travelers: [{ displayName: "Citlalli", phone: "call me" }] }],
    ["ambiguous_phone", { travelers: [{ displayName: "Citlalli", phone: "+52 33 1234 5678" }, { displayName: "Citlalli R", phone: "+1 602 555 0123" }] }],
    ["missing_details", { tripName: "   " }],
  ])("returns 200 and records %s without sending", async (reason, overrides) => {
    const { handler, sends, completions } = setup({ claim: { claimed: true, context: context(overrides) } });

    const response = await handler(webhook());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "skipped", reason });
    expect(sends).toHaveLength(0);
    expect(completions).toEqual([expect.objectContaining({ p_status: "skipped", p_reason: reason, p_attempts: 0 })]);
  });

  it("uses the same number when several traveler contacts store it differently", async () => {
    const { handler, sends } = setup({
      claim: { claimed: true, context: context({ travelers: [
        { displayName: "Citlalli Ramos", phone: "602-555-0123" },
        { displayName: "Citlalli", phone: "+1 (602) 555 0123" },
      ] }) },
    });

    expect(await (await handler(webhook())).json()).toEqual({ status: "sent" });
    expect(JSON.parse(String(sends[0].init.body)).to).toBe("16025550123@c.us");
  });

  it("accepts a message id serialized as an object", async () => {
    const { handler, completions } = setup({ openWa: [json({ success: true, data: { _serialized: MESSAGE_ID } })] });

    expect(await (await handler(webhook())).json()).toEqual({ status: "sent" });
    expect(completions).toEqual([expect.objectContaining({ p_provider_message_id: MESSAGE_ID })]);
  });

  it("records an unlicensed send to a non-contact as a permanent failure", async () => {
    const { handler, sends, completions } = setup({ openWa: [json({ success: true, data: "Not a contact" })] });

    expect(await (await handler(webhook())).json()).toEqual({ status: "failed", errorCode: "not_a_contact" });
    expect(sends).toHaveLength(1);
    expect(completions).toEqual([expect.objectContaining({ p_status: "failed", p_error_code: "not_a_contact" })]);
  });

  it("retries a transient open-wa error once", async () => {
    const { handler, sends, completions } = setup({
      openWa: [json({ success: false, error: "busy" }, 503), json({ success: true, data: MESSAGE_ID })],
    });

    expect(await (await handler(webhook())).json()).toEqual({ status: "sent" });
    expect(sends).toHaveLength(2);
    expect(completions).toEqual([expect.objectContaining({ p_status: "sent", p_attempts: 2 })]);
  });

  it("records a rejected API key without retrying or failing the webhook", async () => {
    const { handler, sends, completions, logs } = setup({ openWa: [json({ error: "unauthorized" }, 401)] });

    const response = await handler(webhook());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "failed", errorCode: "http_401" });
    expect(sends).toHaveLength(1);
    expect(completions).toEqual([expect.objectContaining({ p_status: "failed", p_error_code: "http_401", p_attempts: 1 })]);
    expect(JSON.stringify(logs)).not.toContain("6025550123");
    expect(JSON.stringify(logs)).not.toContain("Citlalli");
  });

  it("records a failure when WhatsApp did not accept the message", async () => {
    const { handler, completions } = setup({ openWa: [json({ success: true, data: false })] });

    expect(await (await handler(webhook())).json()).toEqual({ status: "failed", errorCode: "not_sent" });
    expect(completions).toEqual([expect.objectContaining({ p_status: "failed", p_error_code: "not_sent" })]);
  });

  it("records a failure when the open-wa host stays unreachable", async () => {
    const { handler, sends, completions } = setup({ openWa: [] });

    expect(await (await handler(webhook())).json()).toEqual({ status: "failed", errorCode: "network" });
    expect(sends).toHaveLength(2);
    expect(completions).toEqual([expect.objectContaining({ p_status: "failed", p_error_code: "network", p_attempts: 2 })]);
  });

  it("returns a generic error when the claim RPC fails", async () => {
    const { handler, fetchMock, logs } = setup();
    fetchMock.mockImplementationOnce(async () => new Response("boom", { status: 500 }));

    const response = await handler(webhook());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ status: "error" });
    expect(logs).toEqual([expect.objectContaining({ event: "whatsapp_dispatch_error" })]);
  });
});
