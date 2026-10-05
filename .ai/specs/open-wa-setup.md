# open-wa Easy API Setup (WhatsApp sender for `whatsapp-dispatcher`)

- **Status:** Implemented on the Viatik side (Edge Function + migration 75). The open-wa host still has to be provisioned.
- **Date:** 2026-10-05
- **Supersedes:** the Twilio provider in `.ai/specs/global-whatsapp-dispatcher.md` (see §16 there).
- **Verified against:** `@open-wa/wa-automate` 5.1.0 docs at openwa.dev (the npm `latest` on 2026-09-29).

## 1. Read this first

- **open-wa is not an official WhatsApp API.** It drives WhatsApp Web in headless Chrome. WhatsApp's terms prohibit unofficial automated clients, and the sending number can be banned without warning, especially for unsolicited messages to many people. Use a dedicated number, never a personal one, and only message travelers who opted in.
- **Messaging non-contacts needs a paid open-wa license.** The docs for `sendText` say: "sending to an unknown number requires a Restricted or Premium license." Without a license, a send to a number that is not a contact of the sending account returns `"Not a contact"` instead of a message id. The dispatcher records it as `failed` with `error_code = 'not_a_contact'`. Either buy a license (`--license-key`) or make sure every recipient is saved as a contact on the sending phone.
- **One running process equals one linked WhatsApp session.** If the process restarts without its session profile, someone has to scan a QR code again.

## 2. Architecture

```
notifications INSERT
  → pg_net trigger (migration 73)          POST { record: { id, type } } + x-viatik-webhook-secret
  → Edge Function whatsapp-dispatcher       claim → phone from trip traveler contacts → message text
  → open-wa Easy API (your host)            POST /api/messages/sendText + X-API-Key
  → WhatsApp Web session → recipient
```

Supabase Edge Functions cannot run Chromium, so open-wa runs on a persistent host (Docker on a VM, Railway, Fly.io, and so on). The Edge Function only makes one HTTPS call to it.

## 3. Run it locally first

```bash
npx @open-wa/wa-automate@5.1.0 \
  --session-id viatik \
  --host 127.0.0.1 \
  --port 8080 \
  --api-key "$(openssl rand -hex 32)"
```

- `npx @open-wa/wa-automate@latest --port 8080 --api-key "your-key"` also works, but pin the version so a WhatsApp Web change upstream does not change your runtime unannounced.
- Scan the QR code printed in the terminal with the sender phone (WhatsApp → Linked devices). The session profile is saved under the working directory, so later restarts reconnect without a QR.
- Check the session (protected route):

```bash
curl http://localhost:8080/api/session/getConnectionState -H "X-API-Key: <key>"
```

## 4. Docker (any VM)

The image is x86-64 only (no ARM Chrome), so it does not run on Apple silicon or ARM hosts.

```yaml
# docker-compose.yml
services:
  openwa:
    image: openwa/wa-automate:latest@sha256:d31f5a8f59c4890a302294e9834a25f217a973d80339896ef74cf3d35d903cb3
    init: true
    restart: unless-stopped
    ports:
      - "127.0.0.1:8080:8080"      # private; publish through the proxy in §6
    volumes:
      - ./sessions:/sessions        # WhatsApp session profile; losing it means re-scanning the QR
    environment:
      W_A_V: 5.1.0
      WA_PORT: "8080"
      WA_HOST: 0.0.0.0
      WA_SESSION_ID: viatik
      WA_USER_DATA_DIR: /sessions/viatik
      WA_API_KEY: ${WA_API_KEY:?Set WA_API_KEY in .env}
    command: ["--session-id", "viatik", "--host", "0.0.0.0", "--port", "8080"]
    healthcheck:
      test: ["CMD-SHELL", "wget -q --spider http://localhost:8080/health || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
```

The runtime reads `WA_*` variables only. `OPENWA_API_KEY`, `PORT`, and `SESSION_ID` are not aliases.

Get the first QR from the container logs: `docker compose logs -f openwa`.

## 5. Railway

1. New service → Docker image `openwa/wa-automate` (pin the digest above).
2. Add a **Volume** mounted at `/sessions`.
3. Variables: `W_A_V=5.1.0`, `WA_PORT=8080`, `WA_HOST=0.0.0.0`, `WA_SESSION_ID=viatik`, `WA_USER_DATA_DIR=/sessions/viatik`, `WA_API_KEY=<64 hex chars>`.
4. Start command: `--session-id viatik --host 0.0.0.0 --port 8080`. Set the service's target port to 8080.
5. Open the deploy logs, scan the QR, and wait for the session to report connected.
6. Do not attach Railway's public domain straight to this service (see §6). Put the proxy in front and give the proxy the public domain; reach open-wa over Railway's private network (`openwa.railway.internal:8080`).

## 6. Exposing it to the Edge Function safely

The Edge Function runs on Supabase's network, so open-wa must be reachable over the internet, but the open-wa docs warn that `/health` is public even with an API key and can include the QR code. Anyone holding that QR can link their own device to your WhatsApp account. Expose only the one route Viatik uses, over HTTPS:

```caddyfile
# Caddyfile
wa.example.com {
  @send {
    method POST
    path /api/messages/sendText
  }
  handle @send {
    reverse_proxy openwa:8080      # or openwa.railway.internal:8080
  }
  handle {
    respond 404
  }
}
```

- Use a long random `WA_API_KEY`. The Edge Function refuses plain `http://` endpoints except `localhost`, so the key never travels unencrypted.
- Some proxies drop headers with underscores. Viatik sends `X-API-Key` (hyphenated), which passes through.

## 7. Send-text API contract

**Request**

```http
POST {OPEN_WA_ENDPOINT}/api/messages/sendText
Content-Type: application/json
X-API-Key: <WA_API_KEY>

{
  "to": "16025550123@c.us",
  "content": "Hi Citlalli! You were added to the trip \"Cancún 2026\" on Viatik.\n\nOpen Viatik to see the details."
}
```

- `to` is the chat id: the E.164 number without `+`, followed by `@c.us`.
- `content` is plain text. Newlines are allowed. WhatsApp formatting (`*bold*`, `_italic_`) works.
- `POST /api/sendText` is an accepted alias. `OPEN_WA_ENDPOINT` is the base URL only (for example `https://wa.example.com`); a trailing `/api` is stripped.

```bash
curl -X POST "https://wa.example.com/api/messages/sendText" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $WA_API_KEY" \
  --data '{"to":"16025550123@c.us","content":"Viatik test message"}'
```

**Response**

```json
{ "success": true, "data": "true_16025550123@c.us_9C4D0965EA5C09D591334AB6BDB07FEB" }
```

| Response | Dispatcher result |
|---|---|
| `data` is a message id (`true_…` / `false_…`), or `{ "_serialized": "<id>" }` | `sent`; the id goes to `whatsapp_deliveries.provider_message_id` |
| `data` is a status string, for example `"Not a contact"` | `failed`, `error_code` = the status in snake case (`not_a_contact`) |
| `data` is `false`, or `success` is `false` | `failed`, `not_sent` |
| HTTP 401 / 403 | `failed`, `http_401` / `http_403` (wrong key or refused); not retried |
| HTTP 429 / 5xx, or connection error | retried once after 1 s, then `failed` |
| No response within 15 s | `failed`, `timeout`; not retried, because the message may still go out |

A message id means the message was handed to WhatsApp, not that it was delivered.

## 8. Supabase configuration

1. Apply migrations 73 (webhook, claim, delivery log) and 75 (provider-neutral message id): `supabase db push`.
2. Create the Vault secrets the trigger reads (once per environment):

```sql
select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/whatsapp-dispatcher', 'whatsapp_dispatcher_url');
select vault.create_secret('<random secret>', 'whatsapp_dispatcher_secret');
```

3. Set Edge Function secrets and deploy:

```bash
supabase secrets set \
  OPEN_WA_ENDPOINT=https://wa.example.com \
  OPEN_WA_API_KEY=<WA_API_KEY> \
  WHATSAPP_WEBHOOK_SECRET=<same value as whatsapp_dispatcher_secret> \
  WHATSAPP_DEFAULT_COUNTRY_CODE=1 \
  VIATIK_APP_URL=https://<your app domain>
supabase functions deploy whatsapp-dispatcher
```

| Secret | Required | Purpose |
|---|---|---|
| `OPEN_WA_ENDPOINT` | yes | Base URL of the proxy in §6. HTTPS (or `http://localhost` for local runs). |
| `OPEN_WA_API_KEY` | yes | Same value as `WA_API_KEY` on the open-wa host. |
| `WHATSAPP_WEBHOOK_SECRET` | yes | Authenticates the pg_net call; matches the Vault secret. |
| `WHATSAPP_DEFAULT_COUNTRY_CODE` | no | Country code for 10-digit numbers saved without one. Default `1`. Set `52` if most travelers are in Mexico. |
| `VIATIK_APP_URL` | no | When set, messages end with a link to the trip instead of "Open Viatik to see the details." |

If `OPEN_WA_ENDPOINT` or `OPEN_WA_API_KEY` is missing or invalid, the function answers `200 {"status":"skipped","reason":"open_wa_not_configured"}` and claims nothing, so notifications are not marked as handled.

## 9. Operations

- **Session health:** poll `GET /api/session/getConnectionState` from inside the private network, and alert when it is not connected. HTTP liveness alone does not mean the WhatsApp session works.
- **Re-linking:** if the phone logs out the linked device, or the volume is lost, sends start failing; re-scan the QR from the logs.
- **Updates:** WhatsApp Web changes regularly break automation libraries. Pin a version, watch the open-wa releases, and test a send after each upgrade.
- **Delivery log:** `whatsapp_deliveries` (service role only) shows `status`, `reason`, `error_code`, and `provider_message_id` per notification. The 20-messages-per-recipient-per-day cap from migration 73 still applies.
- **Test per country:** send a real test message to a number from each country you support before launch; number formats that look valid in E.164 can still fail on WhatsApp.
