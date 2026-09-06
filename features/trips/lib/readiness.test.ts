import { describe, expect, it } from "vitest";

import type { Trip } from "@/features/domain/entities";
import { computeReadiness, type ReadinessInput } from "@/features/trips/lib/readiness";

function makeTrip(overrides: Partial<Trip>): Trip {
  return {
    id: "trip-1",
    ownerId: "owner-1",
    name: "Lisbon",
    description: null,
    destination: "Lisbon, Portugal",
    latitude: null,
    longitude: null,
    placeId: null,
    timeZone: null,
    startDate: null,
    endDate: null,
    coverImageUrl: null,
    adultCount: 1,
    childCount: 0,
    baseCurrency: "EUR",
    totalBudgetMinor: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    deletedAt: null,
    ...overrides,
  };
}

function input(overrides: Partial<ReadinessInput>): ReadinessInput {
  return {
    trip: makeTrip({}),
    activityCount: 0,
    memberCount: 1,
    travelerCount: 1,
    vaultEntryCount: 0,
    passportOnFile: false,
    ...overrides,
  };
}

describe("computeReadiness", () => {
  it("scores 0% and returns the first missing item when nothing is complete", () => {
    const result = computeReadiness(input({}));
    expect(result.score).toBe(0);
    expect(result.completed).toBe(0);
    expect(result.nextAction?.key).toBe("dates");
  });

  it("scores 100% and reports no next action when every item is complete", () => {
    const result = computeReadiness(
      input({
        trip: makeTrip({ startDate: "2026-10-01", endDate: "2026-10-05", totalBudgetMinor: 10000n }),
        activityCount: 3,
        memberCount: 2,
        travelerCount: 2,
        vaultEntryCount: 2,
        passportOnFile: true,
      })
    );
    expect(result.score).toBe(100);
    expect(result.completed).toBe(6);
    expect(result.nextAction).toBeNull();
    expect(result.items.every((item) => item.status === "complete")).toBe(true);
  });

  it("scores 50% when only three of six items are complete", () => {
    const result = computeReadiness(
      input({
        trip: makeTrip({ startDate: "2026-10-01", endDate: "2026-10-05", totalBudgetMinor: 5000n }),
        memberCount: 2,
        travelerCount: 2,
      })
    );
    expect(result.score).toBe(50);
    expect(result.completed).toBe(3);
    expect(result.nextAction?.key).toBe("itinerary");
  });

  it("treats a crew as confirmed when members or travelers exceed one", () => {
    const solo = computeReadiness(input({ memberCount: 1, travelerCount: 1 }));
    expect(solo.items.find((item) => item.key === "crew")?.status).toBe("missing");

    const withTravelers = computeReadiness(input({ travelerCount: 2 }));
    expect(withTravelers.items.find((item) => item.key === "crew")?.status).toBe("complete");
  });

  it("flags the passport item from the passportOnFile signal", () => {
    const without = computeReadiness(input({}));
    expect(without.items.find((item) => item.key === "passport")?.status).toBe("missing");

    const withPassport = computeReadiness(input({ passportOnFile: true }));
    expect(withPassport.items.find((item) => item.key === "passport")?.status).toBe("complete");
  });
});
