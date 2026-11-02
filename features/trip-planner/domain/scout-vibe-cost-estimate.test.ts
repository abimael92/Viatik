import { describe, expect, it } from "vitest";

import {
  SCOUT_VIBE_REFERENCE_CREW,
  SCOUT_VIBE_TRIP_DAYS,
  SCOUT_VIBE_WINDOW_MONTHS,
  scoutVibeCostEstimate,
} from "@/features/trip-planner/domain/scout-vibe-cost-estimate";
import type { ScoutTripIdeaSuggestion } from "@/features/trip-planner/domain/scout-trip-ideas-schema";

function idea(overrides: Partial<ScoutTripIdeaSuggestion> = {}): ScoutTripIdeaSuggestion {
  return {
    continent: "Asia",
    flight_route: {
      legs: [{ from: "Guadalajara", to: "Kyoto", approx_duration_minutes: 780, layover_after_minutes: 0 }],
      arrives_same_date: false,
    },
    destination: "Kyoto, Japan",
    ideal_duration_days: 7,
    best_season: "Fall (Oct-Nov) for mild weather.",
    estimated_flight_cost_per_person: 900,
    estimated_daily_budget_per_person: 180,
    estimated_hotel_per_night: 200,
    estimated_alt_stay_per_night: 150,
    scout_pitch:
      "Wander quiet temple paths, then find a tiny noodle shop. It sounds like your kind of reset.",
    ...overrides,
  };
}

describe("scoutVibeCostEstimate", () => {
  it("prices every vibe for the same 5-day window so the cards compare", () => {
    expect(SCOUT_VIBE_TRIP_DAYS).toBe(5);
    expect(SCOUT_VIBE_REFERENCE_CREW).toBe(2);
    expect(SCOUT_VIBE_WINDOW_MONTHS).toEqual({ from: 3, to: 5 });

    const estimate = scoutVibeCostEstimate({ category: "beach", currency: "USD" });
    expect(estimate).toMatchObject({
      category: "beach",
      tripDays: 5,
      crewSize: 2,
      fromGeneratedIdeas: false,
      sampleSize: 5,
    });
  });

  it("averages the reference destinations in integer minor units", () => {
    // Beach baselines for a duo over 5 days: 2070 + 2060 + 3150 + 3160 + 3380.
    expect(scoutVibeCostEstimate({ category: "beach", currency: "USD" })).toMatchObject({
      totalMinor: 276_400n,
      perTravelerMinor: 138_200n,
    });
  });

  it("keeps the five vibes on separate price bands", () => {
    const totals = (["beach", "city", "nature", "food", "default"] as const).map(
      (category) => scoutVibeCostEstimate({ category, currency: "USD" })!.totalMinor
    );
    expect(new Set(totals.map(String)).size).toBe(5);
    expect(scoutVibeCostEstimate({ category: "nature", currency: "USD" })!.totalMinor).toBeGreaterThan(
      scoutVibeCostEstimate({ category: "default", currency: "USD" })!.totalMinor
    );
  });

  it("converts the reference average with an exact currency ratio", () => {
    expect(scoutVibeCostEstimate({ category: "beach", currency: "EUR" })!.totalMinor).toBe(254_300n);
    expect(scoutVibeCostEstimate({ category: "beach", currency: "JPY" })!.totalMinor).toBe(414_600n);
    expect(scoutVibeCostEstimate({ category: "beach", currency: "cad" })!.totalMinor).toBe(373_100n);
  });

  it("re-prices generated ideas at exactly 5 days instead of their ideal length", () => {
    const estimate = scoutVibeCostEstimate({
      category: "food",
      currency: "USD",
      suggestions: [idea({ ideal_duration_days: 9 })],
    });

    // 900 × 2 + 180 × 5 × 2 + 200 × 4 nights.
    expect(estimate).toMatchObject({
      totalMinor: 440_000n,
      perTravelerMinor: 220_000n,
      fromGeneratedIdeas: true,
      sampleSize: 1,
    });
  });

  it("averages several generated ideas and splits the stay across the crew", () => {
    const estimate = scoutVibeCostEstimate({
      category: "beach",
      currency: "USD",
      crewSize: 4,
      suggestions: [idea(), idea({ estimated_hotel_per_night: 400 })],
    });

    // Idea A: 900 × 4 + 180 × 5 × 4 + 200 × 4 nights = 8000. Idea B: 8800.
    expect(estimate!.totalMinor).toBe(840_000n);
    expect(estimate!.perTravelerMinor).toBe(210_000n);
    expect(estimate!.crewSize).toBe(4);
  });

  it("omits the estimate for a currency Scout does not plan in", () => {
    expect(scoutVibeCostEstimate({ category: "city", currency: "CHF" })).toBeNull();
  });

  it("rejects a crew smaller than one traveler", () => {
    expect(() => scoutVibeCostEstimate({ category: "city", currency: "USD", crewSize: 0 })).toThrow(
      RangeError
    );
  });
});
