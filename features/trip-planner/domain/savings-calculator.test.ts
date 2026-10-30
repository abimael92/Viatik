import { describe, expect, it } from "vitest";

import { calculateSavingsSuggestion } from "@/features/trip-planner/domain/savings-calculator";

describe("calculateSavingsSuggestion", () => {
  const today = new Date(2026, 0, 15);

  it("uses whole calendar months when the trip is at least 30 days away and rounds up minor units", () => {
    expect(
      calculateSavingsSuggestion({
        tripStartDate: "2026-05-15",
        targetTripCostMinor: 10_003n,
        currentSavingsMinor: 0n,
        today,
      })
    ).toEqual({
      status: "scheduled",
      cadence: "monthly",
      periods: 4,
      contributionMinor: 2_501n,
      readyOn: "2026-05-15",
      bookBy: "2026-03-20",
    });
  });

  it("defaults to weekly contributions when the trip is fewer than 30 days away", () => {
    expect(
      calculateSavingsSuggestion({
        tripStartDate: "2026-01-30",
        targetTripCostMinor: 10_001n,
        currentSavingsMinor: 1n,
        today,
      })
    ).toEqual({
      status: "scheduled",
      cadence: "weekly",
      periods: 3,
      contributionMinor: 3_334n,
      readyOn: "2026-02-05",
      bookBy: "2026-01-15",
    });
  });

  it("supports a one-time contribution for a near-term trip", () => {
    expect(
      calculateSavingsSuggestion({
        tripStartDate: "2026-01-30",
        targetTripCostMinor: 10_001n,
        currentSavingsMinor: 1n,
        cadence: "once",
        today,
      })
    ).toEqual({
      status: "scheduled",
      cadence: "once",
      periods: 1,
      contributionMinor: 10_000n,
      readyOn: "2026-01-15",
      bookBy: "2026-01-15",
    });
  });

  it("returns zero when the target has been met", () => {
    expect(
      calculateSavingsSuggestion({
        tripStartDate: "2026-05-15",
        targetTripCostMinor: 1_000n,
        currentSavingsMinor: 1_001n,
        today,
      })
    ).toMatchObject({ status: "scheduled", contributionMinor: 0n });
  });

  it("shows the full remainder as due now rather than dividing by zero", () => {
    expect(
      calculateSavingsSuggestion({
        tripStartDate: "2026-01-15",
        targetTripCostMinor: 1_001n,
        currentSavingsMinor: 1n,
        today,
      })
    ).toEqual({
      status: "due-now",
      amountMinor: 1_000n,
      readyOn: "2026-01-15",
      bookBy: "2026-01-15",
    });
  });

  it("never quotes a booking date in the past", () => {
    const suggestion = calculateSavingsSuggestion({
      tripStartDate: "2026-02-20",
      targetTripCostMinor: 1_000n,
      currentSavingsMinor: 0n,
      today,
    });
    expect(suggestion).toMatchObject({ status: "scheduled", bookBy: "2026-01-15" });
  });

  it("moves the booking date earlier for a long-haul window", () => {
    const suggestion = calculateSavingsSuggestion({
      tripStartDate: "2026-05-15",
      targetTripCostMinor: 1_000n,
      currentSavingsMinor: 0n,
      bookingWindowDays: 84,
      today,
    });
    expect(suggestion).toMatchObject({ status: "scheduled", bookBy: "2026-02-20" });
  });

  it("reports missing inputs instead of fabricating a contribution", () => {
    expect(
      calculateSavingsSuggestion({
        tripStartDate: null,
        targetTripCostMinor: null,
        currentSavingsMinor: 0n,
        today,
      })
    ).toEqual({ status: "missing-input", missing: ["tripStartDate", "targetTripCostMinor"] });
  });
});
