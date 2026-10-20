import { afterEach, describe, expect, it, vi } from "vitest";

import { mapScoutIdeaToTripIdea } from "@/features/trip-planner/domain/scout-trip-idea-mapping";
import type { ScoutTripIdeaSuggestion } from "@/features/trip-planner/domain/scout-trip-ideas-schema";

const suggestion: ScoutTripIdeaSuggestion = {
  destination: "Kyoto, Japan",
  ideal_duration_days: 7,
  best_season: "Fall (Oct-Nov) for mild weather and colorful foliage.",
  estimated_flight_cost_per_person: 900,
  estimated_daily_budget_per_person: 180,
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
    expect(mapped.idea.targetTripCostMinor).toBe(432_000n);
    expect(mapped.idea.categoryEstimates).toEqual([
      { category: "transport", amountMinor: 180_000n },
    ]);
    expect(mapped.idea.adultCount).toBe(2);
    expect(mapped.idea.interests).toEqual(["Nature and slow mornings"]);
    expect(mapped.cadence).toBe("weekly");
    expect(mapped.idea.id).toBe("idea-1");
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
    expect(mapped.idea.targetTripCostMinor).toBe(2_160n);

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
