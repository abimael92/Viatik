import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/00000000000042_activity_participation.sql"), "utf8");

describe("activity participation migration", () => {
  it("is additive and validates participant statuses", () => {
    expect(migration).toContain("add column if not exists participants jsonb");
    expect(migration).toContain("'attending', 'declined', 'pending'");
    expect(migration.toLowerCase()).not.toContain("drop column");
  });

  it("includes participants in activity CAS updates", () => {
    expect(migration).toContain("participants=(payload.row).participants");
  });
});