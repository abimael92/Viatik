import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/00000000000073_whatsapp_dispatcher_webhook.sql"),
  "utf8",
);

function functionBody(name: string): string {
  const start = migration.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const bodyStart = migration.indexOf("$$", start);
  return migration.slice(bodyStart, migration.indexOf("$$;", bodyStart + 2));
}

describe("whatsapp dispatcher webhook migration", () => {
  it("is additive and keeps a Level B delivery log out of client reach", () => {
    expect(migration).not.toMatch(/\bdrop\s+(table|column|policy|trigger|function)\b/i);
    expect(migration).toContain("create table public.whatsapp_deliveries");
    expect(migration).toContain("notification_id uuid not null unique references public.notifications (id) on delete cascade");
    expect(migration).toContain("version bigint not null default 1");
    expect(migration).toContain("alter table public.whatsapp_deliveries enable row level security");
    expect(migration).toContain("revoke all on public.whatsapp_deliveries from public, anon, authenticated");
    expect(migration).not.toMatch(/create policy[^;]+whatsapp_deliveries/i);
    expect(migration).not.toMatch(/whatsapp_deliveries[^;]*\bphone\b/i);
  });

  it("posts each notification insert to the Edge Function through pg_net without blocking the insert", () => {
    const trigger = functionBody("dispatch_whatsapp_notification");
    expect(migration).toContain("create extension if not exists pg_net");
    expect(migration).toContain("after insert on public.notifications");
    expect(trigger).toContain("net.http_post");
    expect(trigger).toContain("vault.decrypted_secrets");
    expect(trigger).toContain("'whatsapp_dispatcher_url'");
    expect(trigger).toContain("'whatsapp_dispatcher_secret'");
    expect(trigger).toContain("'x-viatik-webhook-secret'");
    expect(trigger).toContain("'type', 'INSERT'");
    expect(trigger).toContain("exception when others");
    expect(trigger).not.toContain("new.message");
    expect(trigger).not.toMatch(/\bphone\b/i);
  });

  it("resolves phones only from linked trip traveler contacts and never from profiles", () => {
    const claim = functionBody("claim_whatsapp_dispatch");
    expect(claim).toContain("from public.trip_travelers tt");
    expect(claim).toContain("join public.contacts c on c.id = tt.contact_id");
    expect(claim).toContain("c.linked_profile_id = v_notification.user_id");
    expect(claim).toContain("tt.deleted_at is null");
    expect(claim).toContain("c.deleted_at is null");
    expect(claim).toContain("on conflict (notification_id) do nothing");
    expect(claim).toContain("profile_directory");
    expect(claim).not.toMatch(/\bprofiles\b/);
    expect(new Set(claim.match(/[\w.']*\bphone\b'?/g))).toEqual(new Set(["c.phone", "'phone'"]));
  });

  it("limits each recipient's daily WhatsApp volume", () => {
    const claim = functionBody("claim_whatsapp_dispatch");
    expect(claim).toContain("interval '24 hours'");
    expect(claim).toContain("'rate_limited'");
  });

  it("lets only the service role claim and complete deliveries", () => {
    for (const signature of ["claim_whatsapp_dispatch(uuid)", "complete_whatsapp_dispatch(uuid, text, text, text, text, integer)", "dispatch_whatsapp_notification()"]) {
      expect(migration).toContain(`revoke all on function public.${signature} from public, anon, authenticated`);
    }
    expect(migration).toContain("grant execute on function public.claim_whatsapp_dispatch(uuid) to service_role");
    expect(migration).toContain("grant execute on function public.complete_whatsapp_dispatch(uuid, text, text, text, text, integer) to service_role");
    expect(migration.match(/security definer\s+set search_path = public/g)).toHaveLength(3);
  });
});
