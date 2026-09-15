import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/00000000000043_activity_personal_budgets.sql"), "utf8");

describe("activity personal budget security", () => {
  it("is additive and uses Level B metadata", () => {
    expect(migration).toContain("create table public.activity_personal_budgets");
    expect(migration).toContain("version bigint not null default 1");
    expect(migration).toContain("created_at timestamptz not null default now()");
    expect(migration).toContain("updated_at timestamptz not null default now()");
    expect(migration.toLowerCase()).not.toContain("drop column");
  });

  it("restricts every operation to the authenticated owner", () => {
    expect(migration.match(/user_id = auth\.uid\(\)/g)?.length).toBeGreaterThanOrEqual(6);
    expect(migration).toContain("activity_personal_budgets_select_owner");
    expect(migration).toContain("activity_personal_budgets_update_owner");
  });
});