import { describe, expect, it } from "vitest";

import type { Trip } from "@/features/domain/entities";
import { computeReadiness, tripReadinessSummary, type ReadinessInput } from "@/features/trips/lib/readiness";

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
    status: "planned",
    startedAt: null,
    completedAt: null,
    coverImageUrl: null,
    adultCount: 1,
    childCount: 0,
    baseCurrency: "EUR",
    createdBy: "owner-1",
    updatedBy: "owner-1",
    deletedBy: null,
    restoredAt: null,
    restoredBy: null,
    cancelledAt: null,
    statusChangedAt: "2026-01-01T00:00:00Z",
    statusChangedBy: "owner-1",
    version: 1,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    deletedAt: null,
    ...overrides,
  };
}

function input(overrides: Partial<ReadinessInput>): ReadinessInput {
  return {
    trip: makeTrip({}),
    totalBudgetMinor: null,
    activityCount: 0,
    memberCount: 1,
    travelerCount: 1,
    vaultEntryCount: 0,
    packingItemCount: 0,
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
        trip: makeTrip({ startDate: "2026-10-01", endDate: "2026-10-05" }),
        totalBudgetMinor: 10000n,
        activityCount: 3,
        memberCount: 2,
        travelerCount: 2,
        vaultEntryCount: 2,
        packingItemCount: 2,
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
        trip: makeTrip({ startDate: "2026-10-01", endDate: "2026-10-05" }),
        totalBudgetMinor: 5000n,
        memberCount: 2,
        travelerCount: 2,
      })
    );
    expect(result.score).toBe(50);
    expect(result.completed).toBe(3);
    expect(result.nextAction?.key).toBe("itinerary");
  });

  it("uses the explicit crew confirmation instead of the roster count when provided", () => {
    const unconfirmed = computeReadiness(input({ trip: makeTrip({ crewConfirmed: false }), travelerCount: 2 }));
    expect(unconfirmed.items.find((item) => item.key === "crew")?.status).toBe("missing");

    const confirmed = computeReadiness(input({ trip: makeTrip({ crewConfirmed: true }), travelerCount: 1 }));
    expect(confirmed.items.find((item) => item.key === "crew")?.status).toBe("complete");
  });

  it("keeps legacy roster-count behavior when no explicit confirmation exists", () => {
    const solo = computeReadiness(input({ memberCount: 1, travelerCount: 1 }));
    expect(solo.items.find((item) => item.key === "crew")?.status).toBe("missing");

    const withTravelers = computeReadiness(input({ travelerCount: 2 }));
    expect(withTravelers.items.find((item) => item.key === "crew")?.status).toBe("complete");
  });

  it("allows a trip to mark the vault as not needed", () => {
    const result = computeReadiness(input({ trip: makeTrip({ vaultNotNeeded: true }), vaultEntryCount: 0 }));
    expect(result.items.find((item) => item.key === "docs")?.status).toBe("complete");
  });

  it("uses explicit packing completion when provided", () => {
    const incomplete = computeReadiness(input({ trip: makeTrip({ packingConfirmed: false }), packingItemCount: 10 }));
    expect(incomplete.items.find((item) => item.key === "packing")?.status).toBe("missing");

    const complete = computeReadiness(input({ trip: makeTrip({ packingConfirmed: true }), packingItemCount: 0 }));
    expect(complete.items.find((item) => item.key === "packing")?.status).toBe("complete");
  });

  it("keeps legacy packing-list count behavior when no explicit completion exists", () => {
    const without = computeReadiness(input({ packingItemCount: 0 }));
    expect(without.items.find((item) => item.key === "packing")?.status).toBe("missing");

    const withPacking = computeReadiness(input({ packingItemCount: 1 }));
    expect(withPacking.items.find((item) => item.key === "packing")?.status).toBe("complete");
  });
});

describe("tripReadinessSummary", () => {
  it("scores a fully-dated, described trip highly", () => {
    const result = tripReadinessSummary(
      makeTrip({ startDate: "2026-10-01", endDate: "2026-10-05", description: "Trip", destination: "Kyoto" })
    );
    expect(result.score).toBe(100);
    expect(result.label).toBe("Ready");
  });

  it("scores a trip missing its dates and description lower", () => {
    const result = tripReadinessSummary(makeTrip({ destination: null, description: null }));
    expect(result.score).toBe(40);
    expect(result.label).toBe("Almost ready");
  });
});
