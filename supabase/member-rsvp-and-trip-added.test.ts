import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/00000000000065_member_rsvp_and_trip_added.sql"),
  "utf8",
);

describe("member RSVP and direct-add notification", () => {
  it("lets a member change only their own attendance and queues trip_added", () => {
    expect(migration).toContain("activity_participants_rsvp_only");
    expect(migration).toContain("Trip members may only change their own attendance");
    expect(migration).toContain("trip_added");
    expect(migration).toContain("sync_trip_added_notification");
    expect(migration).toContain("Only trip editors can notify a new member");
  });
});
