import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/00000000000070_settlement_recorded_notification.sql"),
  "utf8",
);
const functionBody = migration.slice(migration.indexOf("as $$"));

describe("settlement recorded notification migration", () => {
  it("notifies the payee with a payment payload and does not read a settlement status", () => {
    expect(migration).toContain("add value if not exists 'settlement_recorded'");
    expect(migration).toContain("create or replace function public.generate_settlement_notification()");
    expect(functionBody).not.toContain("new.status");
    expect(migration).not.toContain("settlement_pending");
    expect(migration).toContain("new.deleted_at is not null");
    expect(migration).toContain("recipient.id = new.to_user_id");
    expect(migration).toContain("mute_trip_notifications");
    expect(migration).toContain("new.to_user_id");
    expect(migration).toContain("'settlement_recorded'");
    expect(migration).toContain("'payerUserId', new.from_user_id");
    expect(migration).toContain("'payerName', coalesce(payer_name, '__payer__')");
    expect(migration).toContain("'amount', to_char(new.amount, 'FM9999999990.00')");
    expect(migration).toContain("'currency', new.currency");
    expect(migration).toContain("'tripId', new.trip_id");
    expect(migration).toContain("on conflict (user_id, type, reference_id) do nothing");
    expect(functionBody).not.toMatch(/\bphone\b/i);
    expect(migration).not.toContain("notification_deliveries");
    expect(migration).not.toMatch(/openwa|webhook/i);
    expect(migration).not.toContain("drop trigger");
    expect(migration).not.toContain("create table");
  });
});

const minorUnitsMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/00000000000071_settlement_notification_minor_units.sql"),
  "utf8",
);
const minorUnitsFunctionBody = minorUnitsMigration.slice(
  minorUnitsMigration.indexOf("as $$"),
  minorUnitsMigration.lastIndexOf("$$;"),
);
const backfill = minorUnitsMigration.slice(minorUnitsMigration.lastIndexOf("$$;"));

describe("settlement notification minor-unit payload migration", () => {
  it("stores the raw minor-unit amount and leaves formatting to the client", () => {
    expect(minorUnitsMigration).toContain("create or replace function public.generate_settlement_notification()");
    expect(minorUnitsFunctionBody).toContain("'amount', new.amount::bigint");
    expect(minorUnitsFunctionBody).not.toContain("to_char");
    expect(backfill).not.toContain("to_char");
    expect(minorUnitsFunctionBody).not.toContain("new.status");
    expect(minorUnitsFunctionBody).toContain("new.deleted_at is not null");
    expect(minorUnitsFunctionBody).toContain("mute_trip_notifications");
    expect(minorUnitsFunctionBody).toContain("'payerName', coalesce(payer_name, '__payer__')");
    expect(minorUnitsFunctionBody).toContain("on conflict (user_id, type, reference_id) do nothing");
    expect(minorUnitsFunctionBody).not.toMatch(/\bphone\b/i);
    expect(minorUnitsMigration).not.toContain("drop trigger");
    expect(minorUnitsMigration).not.toContain("create table");
  });

  it("rebuilds existing payment payloads from the settlement without parsing the stored message", () => {
    expect(backfill).toContain("update public.notifications n");
    expect(backfill).toContain("'amount', s.amount::bigint");
    expect(backfill).toContain("n.type = 'settlement_recorded'");
    expect(backfill).toContain("n.reference_id = s.id");
    expect(backfill).toContain("n.user_id = s.to_user_id");
    expect(backfill).not.toContain("::jsonb");
    expect(backfill).not.toMatch(/\bphone\b/i);
  });
});
