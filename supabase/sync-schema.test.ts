import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/00000000000033_add_expense_share_split_type.sql"),
  "utf8",
);
const personalBudgetMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/00000000000057_fix_activity_personal_budget_cas_timestamps.sql"),
  "utf8",
);

describe("expense-share split_type + trip coordinate sync migration (Phase 2C)", () => {
  it("adds the missing split_type column to expense_shares", () => {
    expect(migration).toContain("add column split_type public.expense_split_type");
  });

  it("backfills existing shares from their parent expense split type", () => {
    expect(migration).toContain("update public.expense_shares es");
    expect(migration).toContain("set split_type = e.split_type");
    expect(migration).toContain("from public.expenses e");
    expect(migration).toContain("where es.expense_id = e.id");
  });

  it("restores the not-null default for split_type", () => {
    expect(migration).toContain("alter column split_type set not null");
    expect(migration).toContain("alter column split_type set default 'equal'");
  });

  it("includes latitude/longitude/place_id/time_zone in the trips CAS update branch", () => {
    expect(migration).toMatch(
      /update public\.trips t set .*latitude=\(p\.r\)\.latitude, longitude=\(p\.r\)\.longitude, place_id=\(p\.r\)\.place_id, time_zone=\(p\.r\)\.time_zone/,
    );
  });

  it("still writes split_type in the expense_shares CAS update branch", () => {
    expect(migration).toMatch(
      /update public\.expense_shares t set expense_id=\(p\.r\)\.expense_id, user_id=\(p\.r\)\.user_id, share_amount=\(p\.r\)\.share_amount, share_percentage=\(p\.r\)\.share_percentage, split_type=\(p\.r\)\.split_type/,
    );
  });

  it("preserves the finance entity registrations in the recreated CAS function", () => {
    expect(migration).toMatch(/when 'userWallet' then 'user_wallets'/);
    expect(migration).toMatch(/when 'dailyBudgetOverride' then 'daily_budget_overrides'/);
  });

  it("supplies created_at and updated_at for personal budget CAS inserts", () => {
    expect(personalBudgetMigration).toContain("'created_at', now()");
    expect(personalBudgetMigration).toContain("'updated_at', now()");
  });
});
