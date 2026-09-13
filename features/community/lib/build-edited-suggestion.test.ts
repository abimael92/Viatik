import { describe, expect, it } from "vitest";

import { buildEditedSuggestionSource } from "@/features/community/lib/build-edited-suggestion";
import type { TripCloneSource } from "@/features/community/lib/duplicate-trip";

function makeSource(overrides?: Partial<TripCloneSource>): TripCloneSource {
  return {
    trip: {
      id: "t1",
      ownerId: "template-owner",
      name: "Kyoto Guide",
      description: "A curated Kyoto week.",
      destination: "Kyoto, Japan",
      latitude: 35.0116,
      longitude: 135.7681,
      placeId: "kyoto",
      timeZone: "Asia/Tokyo",
      startDate: "2026-09-01",
      endDate: "2026-09-05",
      status: "planned",
      startedAt: null,
      completedAt: null,
      coverImageUrl: null,
      adultCount: 2,
      childCount: 0,
      baseCurrency: "JPY",
      createdBy: "template-owner",
      updatedBy: "template-owner",
      deletedBy: null,
      restoredAt: null,
      restoredBy: null,
      cancelledAt: null,
      statusChangedAt: "2026-01-01T00:00:00Z",
      statusChangedBy: "template-owner",
      version: 1,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      deletedAt: null,
    },
    activities: [
      {
        id: "a1",
        tripId: "t1",
        dayDate: "2026-09-01",
        title: "Fushimi Inari",
        description: null,
        location: "Kyoto",
        category: "culture",
        startTime: "2026-09-01T09:00:00Z",
        endTime: null,
        position: 0,
        estimatedCostMinor: null,
        createdBy: "template-owner",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        deletedAt: null,
      },
    ],
    expenses: [
      {
        id: "e1",
        tripId: "t1",
        activityId: null,
        description: "Train",
        amountMinor: 1000n,
        currency: "JPY",
        exchangeRateToBase: null,
        paidBy: "template-owner",
        splitType: "equal",
        category: null,
        subcategory: null,
        date: "2026-09-02",
        createdBy: "template-owner",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        deletedAt: null,
      },
    ],
    shares: [],
    ...overrides,
  };
}

describe("buildEditedSuggestionSource", () => {
  it("shifts activity days and expense dates by the new start-date offset", () => {
    const result = buildEditedSuggestionSource(makeSource(), {
      name: "My Kyoto Trip",
      destination: "Kyoto, Japan",
      description: "Edited",
      startDate: "2027-04-10",
      endDate: "2027-04-14",
      adultCount: 2,
      childCount: 0,
      baseCurrency: "JPY",
    });

    expect(result.trip.startDate).toBe("2027-04-10");
    expect(result.activities[0].dayDate).toBe("2027-04-10");
    expect(result.expenses[0].date).toBe("2027-04-11");
  });

  it("applies name, description, and traveler edits to the cloned trip", () => {
    const result = buildEditedSuggestionSource(makeSource(), {
      name: "Renamed Trip",
      destination: "Kyoto, Japan",
      description: "Now 3 travelers",
      startDate: "2026-09-01",
      endDate: "2026-09-05",
      adultCount: 3,
      childCount: 1,
      baseCurrency: "USD",
    });

    expect(result.trip.name).toBe("Renamed Trip");
    expect(result.trip.description).toBe("Now 3 travelers");
    expect(result.trip.adultCount).toBe(3);
    expect(result.trip.childCount).toBe(1);
    expect(result.trip.baseCurrency).toBe("USD");
  });

  it("clears place/geo metadata when the destination changes", () => {
    const result = buildEditedSuggestionSource(makeSource(), {
      name: "Osaka Trip",
      destination: "Osaka, Japan",
      description: null,
      startDate: "2026-09-01",
      endDate: "2026-09-05",
      adultCount: 2,
      childCount: 0,
      baseCurrency: "JPY",
    });

    expect(result.trip.placeId).toBeNull();
    expect(result.trip.latitude).toBeNull();
    expect(result.trip.longitude).toBeNull();
    expect(result.trip.timeZone).toBeNull();
  });

  it("keeps place/geo metadata when the destination is unchanged", () => {
    const result = buildEditedSuggestionSource(makeSource(), {
      name: "Kyoto Guide",
      destination: "Kyoto, Japan",
      description: null,
      startDate: "2026-09-01",
      endDate: "2026-09-05",
      adultCount: 2,
      childCount: 0,
      baseCurrency: "JPY",
    });

    expect(result.trip.placeId).toBe("kyoto");
    expect(result.trip.latitude).toBe(35.0116);
  });
});
