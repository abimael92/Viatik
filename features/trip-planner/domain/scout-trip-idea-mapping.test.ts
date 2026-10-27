import { afterEach, describe, expect, it, vi } from "vitest";

import { mapScoutIdeaToTripIdea } from "@/features/trip-planner/domain/scout-trip-idea-mapping";
import type { ScoutTripIdeaSuggestion } from "@/features/trip-planner/domain/scout-trip-ideas-schema";

const suggestion: ScoutTripIdeaSuggestion = {
  continent: "Asia",
  flight_route: {
    legs: [
      {
        from: "Guadalajara",
        to: "Kyoto",
        approx_duration_minutes: 780,
        layover_after_minutes: 0,
      },
    ],
    arrives_same_date: false,
  },
  destination: "Kyoto, Japan",
  ideal_duration_days: 7,
  best_season: "Fall (Oct-Nov) for mild weather and colorful foliage.",
  estimated_flight_cost_per_person: 900,
  estimated_daily_budget_per_person: 180,
  estimated_hotel_per_night: 200,
  estimated_alt_stay_per_night: 150,
  scout_pitch:
    "This mix of quiet gardens and delicious food sounds right up your alley. You will love the slower pace.",
};

describe("mapScoutIdeaToTripIdea", () => {
  afterEach(() => vi.restoreAllMocks());

  it("multiplies per-person whole-unit estimates with bigint and keeps the chosen cadence", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("idea-1");
    const mapped = mapScoutIdeaToTripIdea({
      suggestion,
      vibe: "Nature and slow mornings",
      crewSize: 2,
      currency: "USD",
      cadence: "weekly",
    });

    expect(mapped.flightPerPersonMinor).toBe(90_000n);
    expect(mapped.dailyPerPersonMinor).toBe(18_000n);
    expect(mapped.idea.targetTripCostMinor).toBe(552_000n);
    expect(mapped.idea.categoryEstimates).toEqual([
      { category: "transport", amountMinor: 180_000n },
      { category: "stay", amountMinor: 120_000n },
      { category: "food", amountMinor: 151_200n },
      { category: "activities", amountMinor: 100_800n },
    ]);
    expect(mapped.idea.adultCount).toBe(2);
    expect(mapped.idea.interests).toEqual(["Nature and slow mornings"]);
    expect(mapped.cadence).toBe("weekly");
    expect(mapped.idea.id).toBe("idea-1");
  });

  it("keeps category estimates summing exactly to the trip goal", () => {
    const mapped = mapScoutIdeaToTripIdea({
      suggestion,
      vibe: "Food",
      crewSize: 3,
      currency: "EUR",
      cadence: "monthly",
    });

    const allocated = mapped.idea.categoryEstimates!.reduce(
      (sum, estimate) => sum + estimate.amountMinor,
      0n
    );
    expect(allocated).toBe(mapped.idea.targetTripCostMinor);
  });

  it("persists origin, pinned dates, place details, contacts, and the route estimate", () => {
    const mapped = mapScoutIdeaToTripIdea({
      suggestion,
      vibe: "",
      crewSize: 3,
      currency: "USD",
      cadence: "monthly",
      originCity: "Guadalajara, Mexico",
      timing: "dates",
      startDate: "2027-03-10",
      endDate: "2027-03-17",
      place: {
        placeId: "place-1",
        latitude: 35.0116,
        longitude: 135.7681,
        timeZone: "Asia/Tokyo",
      },
      travelerContactIds: ["contact-1", "contact-2"],
    });

    expect(mapped.idea.origin).toBe("Guadalajara, Mexico");
    expect(mapped.idea.startDate).toBe("2027-03-10");
    expect(mapped.idea.endDate).toBe("2027-03-17");
    expect(mapped.idea.placeId).toBe("place-1");
    expect(mapped.idea.latitude).toBe(35.0116);
    expect(mapped.idea.longitude).toBe(135.7681);
    expect(mapped.idea.timeZone).toBe("Asia/Tokyo");
    expect(mapped.idea.travelerContactIds).toEqual(["contact-1", "contact-2"]);
    // Route mode sends an empty vibe; an empty interest must not be stored.
    expect(mapped.idea.interests).toEqual([]);
    expect(mapped.idea.flightRoute).toEqual({
      legs: [
        {
          from: "Guadalajara",
          to: "Kyoto",
          approxDurationMinutes: 780,
          layoverAfterMinutes: 0,
        },
      ],
      arrivesSameDate: false,
      isEstimate: true,
    });
  });

  it("leaves dates, place, contacts, and route unset outside exact-date mode", () => {
    const mapped = mapScoutIdeaToTripIdea({
      suggestion,
      vibe: "Food",
      crewSize: 2,
      currency: "USD",
      cadence: "monthly",
      timing: "asap",
      startDate: "2027-03-10",
      endDate: "2027-03-17",
    });

    expect(mapped.idea.origin).toBe("");
    expect(mapped.idea.startDate).toBeNull();
    expect(mapped.idea.endDate).toBeNull();
    expect(mapped.idea.placeId).toBeNull();
    expect(mapped.idea.travelerContactIds).toEqual([]);
  });

  it("does not add cents to zero-decimal currencies and rejects totals over the domain limit", () => {
    const mapped = mapScoutIdeaToTripIdea({
      suggestion,
      vibe: "Food",
      crewSize: 1,
      currency: "JPY",
      cadence: "monthly",
    });
    expect(mapped.flightPerPersonMinor).toBe(900n);
    expect(mapped.idea.targetTripCostMinor).toBe(3_360n);

    expect(() =>
      mapScoutIdeaToTripIdea({
        suggestion: { ...suggestion, estimated_flight_cost_per_person: 100_000_000 },
        vibe: "Food",
        crewSize: 20,
        currency: "USD",
        cadence: "monthly",
      })
    ).toThrow(/supported amount range/);
  });
});
