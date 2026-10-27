import { describe, expect, it } from "vitest";

import { buildScoutIdeaPlan } from "@/features/trip-planner/domain/scout-idea-plan";
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

  it("treats an unset savings pace as leaving whenever the traveler is ready", () => {
    const plan = buildScoutIdeaPlan({
      suggestion,
      crewSize: 2,
      savingsCapacityMinor: 0n,
      savingsCadence: "monthly",
      currency: "USD",
      today,
    });

    expect(plan.savings.hasPace).toBe(false);
    expect(plan.savings.withinReach).toBe(false);
    expect(plan.savings.periods).toBe(0);
    expect(plan.savings.readyOn).toBe("2026-10-21");
    expect(plan.flights.earliestDeparture).toBe("2026-10-21");
    expect(plan.flights.returnDate).toBe("2026-10-27");
    expect(plan.flights.bookBy).toBe("2026-10-21");
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

  it("pins stay and flight dates to exact dates with no flex window", () => {
    const plan = buildScoutIdeaPlan({
      suggestion,
      crewSize: 2,
      savingsCapacityMinor: 50_000n,
      savingsCadence: "monthly",
      currency: "USD",
      today,
      timing: "dates",
      startDate: "2027-06-10",
      endDate: "2027-06-16",
    });

    expect(plan.dates.pinned).toBe(true);
    expect(plan.stay.checkIn).toBe("2027-06-10");
    expect(plan.stay.checkOut).toBe("2027-06-16");
    expect(plan.flights.earliestDeparture).toBe("2027-06-10");
    expect(plan.flights.latestDeparture).toBe("2027-06-10");
    expect(plan.flights.returnDate).toBe("2027-06-16");
    // Long-haul booking window back from the pinned departure, never the past.
    expect(plan.flights.bookBy).toBe("2027-03-18");
    // Savings fields still describe the pace-based ready date.
    expect(plan.savings.readyOn).toBe("2027-08-21");
  });

  it("reports the uncovered shortfall on the pinned start date in minor units", () => {
    // 7 whole months elapse between 2026-10-21 and 2027-06-10:
    // covered = 7 × 50_000 = 350_000; grand total 468_000 → shortfall 118_000.
    const plan = buildScoutIdeaPlan({
      suggestion,
      crewSize: 2,
      savingsCapacityMinor: 50_000n,
      savingsCadence: "monthly",
      currency: "USD",
      today,
      timing: "dates",
      startDate: "2027-06-10",
      endDate: "2027-06-16",
    });
    expect(plan.dates.shortfallMinor).toBe(118_000n);

    const weekly = buildScoutIdeaPlan({
      suggestion,
      crewSize: 2,
      savingsCapacityMinor: 12_500n,
      savingsCadence: "weekly",
      currency: "USD",
      today,
      timing: "dates",
      startDate: "2026-11-04",
      endDate: "2026-11-10",
    });
    // 2 whole weeks elapse → covered 25_000 → shortfall 443_000.
    expect(weekly.dates.shortfallMinor).toBe(443_000n);

    const covered = buildScoutIdeaPlan({
      suggestion,
      crewSize: 2,
      savingsCapacityMinor: 50_000n,
      savingsCadence: "monthly",
      currency: "USD",
      today,
      timing: "dates",
      startDate: "2027-12-10",
      endDate: "2027-12-16",
    });
    // 13 months elapsed → covered 650_000 ≥ 468_000.
    expect(covered.dates.shortfallMinor).toBe(0n);

    const noPace = buildScoutIdeaPlan({
      suggestion,
      crewSize: 2,
      savingsCapacityMinor: 0n,
      savingsCadence: "monthly",
      currency: "USD",
      today,
      timing: "dates",
      startDate: "2027-06-10",
      endDate: "2027-06-16",
    });
    expect(noPace.dates).toEqual({ pinned: true, shortfallMinor: null });
  });

  it("leaves dates unpinned for the other timings", () => {
    const plan = buildScoutIdeaPlan({
      suggestion,
      crewSize: 2,
      savingsCapacityMinor: 50_000n,
      savingsCadence: "monthly",
      currency: "USD",
      today,
      timing: "asap",
      startDate: "2027-06-10",
      endDate: "2027-06-16",
    });
    expect(plan.dates).toEqual({ pinned: false, shortfallMinor: null });
    expect(plan.stay.checkIn).toBe("2027-08-21");
  });
});
