import { describe, expect, it } from "vitest";

import { withOwnAttendance } from "@/features/activities/lib/own-attendance";

describe("withOwnAttendance", () => {
  it("adds only the current user when they are missing from the roster", () => {
    const others = [{ userId: "user-2", status: "attending" as const }];
    expect(withOwnAttendance(others, "user-1", "declined")).toEqual([
      { userId: "user-2", status: "attending" },
      { userId: "user-1", travelerId: null, status: "declined" },
    ]);
  });

  it("changes only the current user's status", () => {
    const roster = [
      { userId: "user-1", travelerId: null, displayName: "You", status: "attending" as const },
      { userId: null, travelerId: "traveler-1", displayName: "Alex", status: "attending" as const },
    ];
    expect(withOwnAttendance(roster, "user-1", "declined")).toEqual([
      { userId: "user-1", travelerId: null, displayName: "You", status: "declined" },
      { userId: null, travelerId: "traveler-1", displayName: "Alex", status: "attending" },
    ]);
  });

  it("returns the same roster when the status is already set", () => {
    const roster = [{ userId: "user-1", status: "declined" as const }];
    expect(withOwnAttendance(roster, "user-1", "declined")).toBe(roster);
  });
});
