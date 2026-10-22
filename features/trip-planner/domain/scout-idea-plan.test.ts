import { describe, expect, it } from "vitest";

import { buildScoutIdeaPlan } from "@/features/trip-planner/domain/scout-idea-plan";
import type { ScoutTripIdeaSuggestion } from "@/features/trip-planner/domain/scout-trip-ideas-schema";

const suggestion: ScoutTripIdeaSuggestion = {
  destination: "Kyoto, Japan",
  ideal_duration_days: 7,
  best_season: "Fall (Oct-Nov) for mild weather and colorful foliage.",
  estimated_flight_cost_per_person: 900,
  estimated_daily_budget_per_person: 120,
  estimated_hotel_per_night: 200,
  estimated_alt_stay_per_night: 150,
  scout_pitch:
    "This mix of quiet gardens and delicious food sounds right up your alley. You will love the slower pace.",
};

const today = new Date(2026, 9, 21);

describe("buildScoutIdeaPlan", () => {
  it("builds a whole-crew budget breakdown in minor units", () => {
    const plan = buildScoutIdeaPlan({
      suggestion,
      crewSize: 2,
      savingsCapacityMinor: 50_000n,
      savingsCadence: "monthly",
      currency: "USD",
      today,
    });

    expect(plan.nights).toBe(6);
    expect(plan.flightTotalMinor).toBe(180_000n);
    expect(plan.dailyTotalMinor).toBe(168_000n);
    expect(plan.stay.hotelTotalMinor).toBe(120_000n);
    expect(plan.stay.altTotalMinor).toBe(90_000n);
    expect(plan.stay.altSavingsMinor).toBe(30_000n);
    expect(plan.grandTotalMinor).toBe(468_000n);
    expect(plan.stay.checkIn).toBe("2027-08-21");
    expect(plan.stay.checkOut).toBe("2027-08-27");
    expect(plan.flights.returnDate).toBe("2027-08-27");
  });

  it("derives the savings timeline and ready date from the group capacity", () => {
    const plan = buildScoutIdeaPlan({
      suggestion,
      crewSize: 2,
      savingsCapacityMinor: 50_000n,
      savingsCadence: "monthly",
      currency: "USD",
      today,
    });

    expect(plan.savings.cadence).toBe("monthly");
    expect(plan.savings.contributionMinor).toBe(50_000n);
    expect(plan.savings.periods).toBe(10);
    expect(plan.savings.readyOn).toBe("2027-08-21");
  });

  it("uses weeks for a weekly cadence", () => {
    const plan = buildScoutIdeaPlan({
      suggestion,
      crewSize: 2,
      savingsCapacityMinor: 12_500n,
      savingsCadence: "weekly",
      currency: "USD",
      today,
    });

    expect(plan.savings.cadence).toBe("weekly");
    expect(plan.savings.periods).toBe(38);
    expect(plan.savings.readyOn).toBe("2027-07-14");
  });

  it("recommends a longer booking window for long-haul fares and never books in the past", () => {
    const longHaul = buildScoutIdeaPlan({
      suggestion,
      crewSize: 2,
      savingsCapacityMinor: 50_000n,
      savingsCadence: "monthly",
      currency: "USD",
      today,
    });
    expect(longHaul.flights.bookingWindowDays).toBe(84);
    expect(longHaul.flights.earliestDeparture).toBe("2027-08-21");
    expect(longHaul.flights.latestDeparture).toBe("2027-09-03");
    expect(longHaul.flights.bookBy).toBe("2027-05-29");

    const shortHaul = buildScoutIdeaPlan({
      suggestion: { ...suggestion, estimated_flight_cost_per_person: 320 },
      crewSize: 2,
      savingsCapacityMinor: 900_000n,
      savingsCadence: "monthly",
      currency: "USD",
      today,
    });
    expect(shortHaul.flights.bookingWindowDays).toBe(56);
    expect(shortHaul.flights.bookBy).toBe("2026-10-21");
  });

  it("keeps zero-decimal currencies free of cents", () => {
    const plan = buildScoutIdeaPlan({
      suggestion,
      crewSize: 1,
      savingsCapacityMinor: 30_000n,
      savingsCadence: "monthly",
      currency: "JPY",
      today,
    });

    expect(plan.flightTotalMinor).toBe(900n);
    expect(plan.stay.hotelTotalMinor).toBe(1_200n);
    expect(plan.grandTotalMinor).toBe(900n + 1_200n + 840n);
  });

  it("defers departure to a pinned month but never before the savings goal is met", () => {
    const pinnedLater = buildScoutIdeaPlan({
      suggestion,
      crewSize: 2,
      savingsCapacityMinor: 50_000n,
      savingsCadence: "monthly",
      currency: "USD",
      today,
      timing: "month",
      targetMonth: "2027-12",
    });
    expect(pinnedLater.flights.earliestDeparture).toBe("2027-12-01");
    expect(pinnedLater.flights.bookBy).toBe("2027-09-08");

    const pinnedEarlier = buildScoutIdeaPlan({
      suggestion,
      crewSize: 2,
      savingsCapacityMinor: 50_000n,
      savingsCadence: "monthly",
      currency: "USD",
      today,
      timing: "month",
      targetMonth: "2026-11",
    });
    expect(pinnedEarlier.flights.earliestDeparture).toBe("2027-08-21");

    const asap = buildScoutIdeaPlan({
      suggestion,
      crewSize: 2,
      savingsCapacityMinor: 50_000n,
      savingsCadence: "monthly",
      currency: "USD",
      today,
      timing: "asap",
      targetMonth: "2027-12",
    });
    expect(asap.flights.earliestDeparture).toBe("2027-08-21");
  });
});
