import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/00000000000041_activity_timing_and_booking.sql"),
  "utf8"
);

describe("activity timing and booking migration", () => {
  it("adds flexible timing and booking fields without dropping columns", () => {
    expect(migration).toContain("add column if not exists timing_specificity");
    expect(migration).toContain("add column if not exists flexible_period");
    expect(migration).toContain("add column if not exists booking_reference");
    expect(migration.toLowerCase()).not.toContain("drop column");
  });

  it("includes the fields in activity CAS updates", () => {
    expect(migration).toContain("timing_specificity = (payload.row).timing_specificity");
    expect(migration).toContain("flexible_period = (payload.row).flexible_period");
    expect(migration).toContain("booking_reference = (payload.row).booking_reference");
  });
});