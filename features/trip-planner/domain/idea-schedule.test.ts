import { describe, expect, it } from "vitest";

import { buildIdeaSchedule } from "@/features/trip-planner/domain/idea-schedule";

const today = new Date(2026, 9, 29); // 29 Oct 2026

const base = {
  targetTripCostMinor: 1_400_000n, // MX$14,000
  currentSavingsMinor: 0n,
  savingsCapacityMinor: null,
  savingsCadence: null,
  targetMonth: null,
  startDate: null,
  endDate: null,
  durationDays: 4,
  bookingWindowDays: 56,
  today,
} as const;

describe("buildIdeaSchedule", () => {
  it("derives the plan from Scout's savings pace", () => {
    const schedule = buildIdeaSchedule({
      ...base,
      savingsCapacityMinor: 200_000n,
      savingsCadence: "monthly",
    });

    expect(schedule).toMatchObject({
      hasPace: true,
      contributionMinor: 200_000n,
      cadence: "monthly",
      periods: 7,
      readyOn: "2027-05-29",
      departureStart: "2027-05-29",
      departureEnd: "2027-06-01",
      days: 4,
      isEstimate: true,
    });
    expect(schedule?.bookBy).toBe("2027-04-03");
  });

  it("keeps pinned dates and splits the goal across the periods left", () => {
    const schedule = buildIdeaSchedule({ ...base, startDate: "2027-03-10" });

    expect(schedule).toMatchObject({
      hasPace: false,
      cadence: "monthly",
      periods: 5,
      contributionMinor: 280_000n,
      departureStart: "2027-03-10",
      departureEnd: "2027-03-13",
      days: 4,
      isEstimate: false,
    });
  });

  it("never quotes a travel window longer than 30 days", () => {
    const schedule = buildIdeaSchedule({
      ...base,
      startDate: "2027-03-01",
      endDate: "2027-05-30",
    });

    expect(schedule?.days).toBe(30);
    expect(schedule?.departureEnd).toBe("2027-03-30");
  });

  it("leaves in the pinned month, but not before the goal is reached", () => {
    const early = buildIdeaSchedule({
      ...base,
      targetMonth: "2026-12",
      savingsCapacityMinor: 200_000n,
      savingsCadence: "monthly",
    });
    expect(early?.departureStart).toBe("2027-05-29");

    const reachable = buildIdeaSchedule({
      ...base,
      targetMonth: "2027-08",
      savingsCapacityMinor: 200_000n,
      savingsCadence: "monthly",
    });
    expect(reachable?.departureStart).toBe("2027-08-01");
  });

  it("reports the shortfall when a pinned departure cannot be covered", () => {
    const schedule = buildIdeaSchedule({
      ...base,
      startDate: "2026-12-01",
      savingsCapacityMinor: 100_000n,
      savingsCadence: "monthly",
    });

    expect(schedule?.shortfallMinor).toBe(1_300_000n);
  });

  it("returns null without a target or any timing context", () => {
    expect(buildIdeaSchedule({ ...base, targetTripCostMinor: null })).toBeNull();
    expect(buildIdeaSchedule(base)).toBeNull();
  });
});
