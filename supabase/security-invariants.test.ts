import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/00000000000017_security_invariants.sql"), "utf8").toLowerCase();

describe("security invariants migration", () => {
  it("enforces authenticated creator attribution and immutability", () => {
    expect(migration).toContain("new.created_by := actor");
    expect(migration).toContain("created_by is immutable");
    expect(migration.match(/alter column created_by set default auth\.uid\(\)/g)).toHaveLength(5);
  });

  it("validates financial participants as active trip members", () => {
    expect(migration).toContain("validate_expense_membership");
    expect(migration).toContain("validate_expense_share_membership");
    expect(migration).toContain("validate_settlement_membership");
    expect(migration).toContain("public.is_active_trip_member(new.trip_id, new.paid_by)");
    expect(migration).toContain("public.is_active_trip_member(parent_trip_id, new.user_id)");
  });

  it("locks invitations and restricts recipient transitions", () => {
    expect(migration).toContain("for update");
    expect(migration).toContain("invitation recipient is immutable");
    expect(migration).toContain("invalid invitation status transition");
    expect(migration).toContain("revoke all on function public.accept_trip_invitation(uuid) from public");
    expect(migration).toContain("revoke all on function public.reject_trip_invitation(uuid) from public");
  });
});
