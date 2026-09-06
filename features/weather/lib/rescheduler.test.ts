import { describe, expect, it, vi } from "vitest";

import type { Activity } from "@/features/domain/entities";
import type { DailyForecast } from "@/features/weather/domain/weather-types";
import { DEFAULT_CONFLICT_THRESHOLDS } from "@/features/weather/lib/weather-conflict";
import {
  conditionsByDate,
  nextDayPosition,
  rescheduleActivity,
  shiftStartTimeToDay,
  suggestIndoorSwap,
  suggestReschedule,
  swapActivityIndoor,
  type ReschedulerDeps,
} from "@/features/weather/lib/rescheduler";

function makeActivity(partial: Partial<Activity>): Activity {
  return {
    id: "act-1",
    tripId: "trip-1",
    dayDate: "2026-06-01",
    title: "Hiking",
    description: null,
    location: null,
    category: "outdoors",
    startTime: "2026-06-01T10:00:00",
    endTime: null,
    position: 1,
    estimatedCostMinor: null,
    createdBy: "user-1",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    deletedAt: null,
    ...partial,
  };
}

function forecastFor(days: Array<{ date: string; rain?: number; wind?: number }>): DailyForecast {
  return {
    dates: days.map((d) => d.date),
    temperature2mMax: days.map(() => 22),
    temperature2mMin: days.map(() => 12),
    precipitationSum: days.map((d) => d.rain ?? 0),
    weatherCode: days.map(() => 1),
    windSpeed10mMax: days.map((d) => d.wind ?? 10),
  };
}

describe("nextDayPosition", () => {
  it("appends after the largest existing position", () => {
    expect(nextDayPosition([{ position: 100 }, { position: 300 }])).toBe(1324);
  });
  it("starts at the default for an empty day", () => {
    expect(nextDayPosition([])).toBe(1024);
  });
});

describe("shiftStartTimeToDay", () => {
  it("rebases an ISO datetime onto another day, preserving the time", () => {
    expect(shiftStartTimeToDay("2026-06-01T10:00:00", "2026-06-03")).toBe("2026-06-03T10:00:00");
  });
  it("returns null for a missing or invalid time", () => {
    expect(shiftStartTimeToDay(null, "2026-06-03")).toBeNull();
    expect(shiftStartTimeToDay("nope", "2026-06-03")).toBeNull();
  });
});

describe("conditionsByDate", () => {
  it("maps forecast days to conditions", () => {
    const map = conditionsByDate(forecastFor([{ date: "2026-06-01", rain: 30 }, { date: "2026-06-02" }]), ["2026-06-01", "2026-06-02", "2026-06-03"]);
    expect(map["2026-06-01"].precipitationMm).toBe(30);
    expect(map["2026-06-02"]).toBeDefined();
    expect(map["2026-06-03"]).toBeUndefined();
  });
});

describe("suggestReschedule", () => {
  it("moves an outdoor activity to the first clear day, keeping its time", () => {
    const activity = makeActivity({ id: "a1", dayDate: "2026-06-01", startTime: "2026-06-01T10:00:00" });
    const forecast = forecastFor([
      { date: "2026-06-01", rain: 50 },
      { date: "2026-06-02", rain: 0 },
      { date: "2026-06-03", rain: 60 },
      { date: "2026-06-04", rain: 0 },
    ]);
    const suggestion = suggestReschedule(activity, ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04"], conditionsByDate(forecast, ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04"]), DEFAULT_CONFLICT_THRESHOLDS);
    expect(suggestion).not.toBeNull();
    expect(suggestion?.dayDate).toBe("2026-06-02");
    expect(suggestion?.startTime).toBe("2026-06-02T10:00:00");
    expect(suggestion?.reason).toContain("avoid the weather");
  });

  it("returns null when every other day is hazardous", () => {
    const activity = makeActivity({ id: "a1", dayDate: "2026-06-01" });
    const forecast = forecastFor([
      { date: "2026-06-01", rain: 50 },
      { date: "2026-06-02", rain: 90 },
    ]);
    const suggestion = suggestReschedule(activity, ["2026-06-01", "2026-06-02"], conditionsByDate(forecast, ["2026-06-01", "2026-06-02"]), DEFAULT_CONFLICT_THRESHOLDS);
    expect(suggestion).toBeNull();
  });

  it("treats an indoor activity as clear on any day", () => {
    const activity = makeActivity({ id: "a1", dayDate: "2026-06-01", category: "culture", title: "Museum" });
    const forecast = forecastFor([
      { date: "2026-06-01", rain: 60 },
      { date: "2026-06-02", rain: 90 },
    ]);
    const suggestion = suggestReschedule(activity, ["2026-06-01", "2026-06-02"], conditionsByDate(forecast, ["2026-06-01", "2026-06-02"]), DEFAULT_CONFLICT_THRESHOLDS);
    expect(suggestion?.dayDate).toBe("2026-06-02");
  });
});

describe("suggestIndoorSwap", () => {
  it("matches outdoor categories to indoor alternatives", () => {
    expect(suggestIndoorSwap({ category: "outdoors", title: "Hiking the trail" }).title).toBe("Indoor climbing gym");
    expect(suggestIndoorSwap({ category: "sightseeing", title: "Beach day" }).title).toBe("Aquarium visit");
    expect(suggestIndoorSwap({ category: "sightseeing", title: "Walking tour" }).title).toBe("Museum visit");
  });
  it("falls back to a museum for unmatched activities", () => {
    expect(suggestIndoorSwap({ category: "mystery", title: "Uncategorized thing" }).title).toBe("Museum visit");
  });
});

describe("appliers", () => {
  function makeDeps() {
    const moves: Array<{ id: string; dayDate: string; position: number }> = [];
    const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
    const deps: ReschedulerDeps = {
      activity: {
        move: vi.fn(async (id: string, dayDate: string, position: number) => {
          moves.push({ id, dayDate, position });
          return {} as never;
        }),
        update: vi.fn(async (id: string, patch: Record<string, unknown>) => {
          updates.push({ id, patch });
          return {} as never;
        }),
      },
    };
    return { deps, moves, updates };
  }

  it("rescheduleActivity moves to a new day and updates the time slot", async () => {
    const { deps, moves, updates } = makeDeps();
    const activity = makeActivity({ id: "a1", startTime: "2026-06-01T09:00:00" });
    await rescheduleActivity(activity, { dayDate: "2026-06-02", startTime: "2026-06-02T09:00:00", position: 2048 }, deps);
    expect(moves).toEqual([{ id: "a1", dayDate: "2026-06-02", position: 2048 }]);
    expect(updates).toEqual([{ id: "a1", patch: { startTime: "2026-06-02T09:00:00" } }]);
  });

  it("rescheduleActivity only updates the time when the day is unchanged", async () => {
    const { deps, moves, updates } = makeDeps();
    const activity = makeActivity({ id: "a1", dayDate: "2026-06-01", startTime: "2026-06-01T09:00:00" });
    await rescheduleActivity(activity, { dayDate: "2026-06-01", startTime: "2026-06-01T14:00:00" }, deps);
    expect(moves).toHaveLength(0);
    expect(updates).toEqual([{ id: "a1", patch: { startTime: "2026-06-01T14:00:00" } }]);
  });

  it("swapActivityIndoor replaces the title, category, and description", async () => {
    const { deps, updates } = makeDeps();
    const activity = makeActivity({ id: "a1" });
    await swapActivityIndoor(activity, { title: "Museum visit", category: "indoor", description: "Weatherproof.", reason: "swap" }, deps);
    expect(updates).toEqual([
      { id: "a1", patch: { title: "Museum visit", category: "indoor", description: "Weatherproof." } },
    ]);
  });
});
