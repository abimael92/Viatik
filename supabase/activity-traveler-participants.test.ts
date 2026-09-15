import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/00000000000044_activity_traveler_participants.sql"), "utf8");

describe("activity traveler participants migration", () => {
  it("accepts either account or named traveler identities without dropping schema", () => {
    expect(migration).toContain("participant ->> 'userId'");
    expect(migration).toContain("participant ->> 'travelerId'");
    expect(migration.toLowerCase()).not.toContain("drop column");
  });
});