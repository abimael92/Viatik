import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/00000000000046_unified_decisions.sql"),
  "utf8",
);

describe("unified decisions migration", () => {
  it("creates the three additive decision tables with Level A metadata", () => {
    expect(migration).toContain("create table public.decisions");
    expect(migration).toContain("create table public.decision_options");
    expect(migration).toContain("create table public.decision_votes");
    for (const field of ["created_at", "created_by", "updated_at", "updated_by", "version"]) {
      expect(migration.match(new RegExp(field, "g"))?.length ?? 0).toBeGreaterThanOrEqual(3);
    }
    expect(migration.toLowerCase()).not.toContain("drop table");
  });

  it("enforces one vote per user per decision", () => {
    expect(migration).toContain("unique (decision_id, user_id)");
    expect(migration).toContain("validate_decision_vote_option");
  });

  it("protects decisions and votes with membership-aware RLS", () => {
    expect(migration).toContain('create policy "decisions_select_members"');
    expect(migration).toContain('create policy "decision_votes_insert_members"');
    expect(migration).toContain("public.is_trip_member(d.trip_id)");
    expect(migration).toContain("d.status = 'open'");
  });
});
