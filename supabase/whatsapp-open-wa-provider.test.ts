// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/00000000000075_whatsapp_open_wa_provider.sql"),
  "utf8",
).toLowerCase();

describe("open-wa provider migration", () => {
  it("replaces the Twilio-only message id with a provider-neutral one", () => {
    expect(migration).toContain("rename column twilio_message_sid to provider_message_id");
    expect(migration).toContain("drop constraint if exists whatsapp_deliveries_twilio_message_sid_check");
    expect(migration).toMatch(/check \(provider_message_id is null or char_length\(provider_message_id\) <= 200\)/);
  });

  it("keeps completion service-role only with the renamed parameter", () => {
    expect(migration).toContain("p_provider_message_id text");
    expect(migration).toContain("provider_message_id = left(p_provider_message_id, 200)");
    expect(migration).toContain("security definer");
    expect(migration).toContain("revoke all on function public.complete_whatsapp_dispatch(uuid, text, text, text, text, integer) from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.complete_whatsapp_dispatch(uuid, text, text, text, text, integer) to service_role");
  });

  it("reuses the existing webhook instead of adding a second trigger", () => {
    expect(migration).not.toContain("create trigger");
    expect(migration).not.toContain("net.http_post");
    expect(migration).not.toMatch(/\bprofiles\b/);
  });
});
