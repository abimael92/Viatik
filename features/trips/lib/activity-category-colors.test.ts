import { describe, expect, it } from "vitest";

import { getActivityCategoryColors, isUserAttending, isUserConfirmedAttending } from "@/features/trips/lib/activity-category-colors";
import type { Activity } from "@/features/domain/entities";

describe("activity category presentation", () => {
  it("maps canonical and legacy categories deterministically", () => {
    expect(getActivityCategoryColors("food")).toEqual(getActivityCategoryColors("food-and-drink"));
    expect(getActivityCategoryColors("transit").border).toBe("border-blue-500");
    expect(getActivityCategoryColors("sightseeing").border).toBe("border-emerald-500");
  });

  it("requires an explicit attending status", () => {
    const activity = { participants: [{ userId: "user-1", status: "pending" }] } as Activity;
    expect(isUserAttending(activity, "user-1")).toBe(false);
    expect(isUserAttending({ ...activity, participants: [{ userId: "user-1", status: "attending" }] }, "user-1")).toBe(true);
  });

  it("keeps legacy group activities colored while Home remains strict", () => {
    const legacyActivity = { participants: [] } as unknown as Activity;
    expect(isUserAttending(legacyActivity, "user-1")).toBe(true);
    expect(isUserConfirmedAttending(legacyActivity, "user-1")).toBe(false);
  });
});