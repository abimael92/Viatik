import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/00000000000077_whatsapp_opt_in.sql"), "utf8");

function functionBody(name: string): string {
  const start = migration.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const bodyStart = migration.indexOf("$$", start);
  return migration.slice(bodyStart, migration.indexOf("$$;", bodyStart + 2));
}

describe("whatsapp opt-in migration", () => {
  it("adds an opt-in flag that is off by default", () => {
    expect(migration).not.toMatch(/\bdrop\s+(table|column|policy|trigger|function)\b/i);
    expect(migration).toContain("add column if not exists whatsapp_notifications_enabled boolean not null default false");
  });

  it("stamps consent changes on the server", () => {
    const stamp = functionBody("stamp_whatsapp_consent");
    expect(migration).toContain("before insert or update on public.profiles");
    expect(stamp).toContain("new.whatsapp_notifications_enabled is distinct from old.whatsapp_notifications_enabled");
    expect(stamp).toContain("new.whatsapp_consent_updated_at := old.whatsapp_consent_updated_at");
  });

  it("skips recipients who have not opted in before claiming a delivery", () => {
    const claim = functionBody("claim_whatsapp_dispatch");
    const gate = claim.indexOf("whatsapp_notifications_enabled");
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(claim.indexOf("v_recent_sent >= 20"));
    expect(claim).toContain("if not coalesce(v_opted_in, false) then");
    expect(claim).toContain("'skipped', 'not_opted_in'");
    expect(claim).toContain("case when found then 'not_opted_in' else 'duplicate' end");
  });

  it("reads profiles only for the opt-in flag and still takes phones from traveler contacts", () => {
    const claim = functionBody("claim_whatsapp_dispatch");
    expect(claim.match(/\bpublic\.profiles\b/g)).toHaveLength(1);
    expect(claim).toContain("select p.whatsapp_notifications_enabled into v_opted_in\n  from public.profiles p where p.id = v_notification.user_id");
    expect(claim).not.toMatch(/\bp\.phone\b/);
    expect(claim).toContain("join public.contacts c on c.id = tt.contact_id");
    expect(new Set(claim.match(/[\w.']*\bphone\b'?/g))).toEqual(new Set(["c.phone", "'phone'"]));
  });

  it("keeps the claim service-role only", () => {
    expect(migration).toMatch(/claim_whatsapp_dispatch\(p_notification_id uuid\)\s+returns jsonb\s+language plpgsql\s+security definer\s+set search_path = public/);
    expect(migration).toContain("revoke all on function public.claim_whatsapp_dispatch(uuid) from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.claim_whatsapp_dispatch(uuid) to service_role");
  });
});
