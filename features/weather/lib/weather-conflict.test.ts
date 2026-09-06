import { describe, expect, it } from "vitest";

import type { Activity } from "@/features/domain/entities";
import type { DailyForecast } from "@/features/weather/domain/weather-types";
import {
  activeHazards,
  classifyActivitySensitivity,
  conditionFromForecast,
  conflictsByActivityId,
  detectConflicts,
  hazardLabel,
  impactedActivityCount,
  sensitivityAffected,
} from "@/features/weather/lib/weather-conflict";

function makeActivity(partial: Partial<Activity>): Activity {
  return {
    id: "act-1",
    tripId: "trip-1",
    dayDate: "2026-06-01",
    title: "Activity",
    description: null,
    location: null,
    category: "general",
    startTime: null,
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

function forecastFor(dayDate: string, patch: Partial<DailyForecast> = {}): DailyForecast {
  return {
    dates: [dayDate],
    temperature2mMax: [25],
    temperature2mMin: [15],
    precipitationSum: [0],
    weatherCode: [1],
    windSpeed10mMax: [10],
    ...patch,
  };
}

describe("classifyActivitySensitivity", () => {
  it("classifies outdoor activities", () => {
    expect(classifyActivitySensitivity({ category: "outdoors", title: "Hiking in the mountains" })).toBe("outdoor");
    expect(classifyActivitySensitivity({ category: "sightseeing", title: "Beach day" })).toBe("outdoor");
    expect(classifyActivitySensitivity({ category: "general", title: "Guided walking tour" })).toBe("outdoor");
  });

  it("classifies indoor activities", () => {
    expect(classifyActivitySensitivity({ category: "culture", title: "Museum visit" })).toBe("indoor");
    expect(classifyActivitySensitivity({ category: "food", title: "Dinner at a restaurant" })).toBe("indoor");
    expect(classifyActivitySensitivity({ category: "indoor", title: "Aquarium" })).toBe("indoor");
  });

  it("defaults unknown categories to neutral", () => {
    expect(classifyActivitySensitivity({ category: "mystery", title: "Mystery box" })).toBe("neutral");
  });
});

describe("conditionFromForecast", () => {
  it("extracts a normalized condition for a matching day", () => {
    const forecast = forecastFor("2026-06-01", { precipitationSum: [30], windSpeed10mMax: [60] });
    expect(conditionFromForecast(forecast, "2026-06-01")).toEqual({
      dayDate: "2026-06-01",
      precipitationMm: 30,
      windSpeedKmh: 60,
      maxTempC: 25,
      minTempC: 15,
      weatherCode: 1,
    });
  });

  it("returns undefined for a missing day or empty forecast", () => {
    expect(conditionFromForecast(forecastFor("2026-06-01"), "2026-06-02")).toBeUndefined();
    expect(conditionFromForecast(undefined, "2026-06-01")).toBeUndefined();
  });
});

describe("activeHazards", () => {
  it("flags rain above the threshold with severity bands", () => {
    expect(activeHazards({ dayDate: "d", precipitationMm: 25, windSpeedKmh: 0, maxTempC: 20, minTempC: 10 })).toEqual([
      { hazard: "heavyRain", severity: "medium" },
    ]);
    expect(activeHazards({ dayDate: "d", precipitationMm: 50, windSpeedKmh: 0, maxTempC: 20, minTempC: 10 })).toEqual([
      { hazard: "heavyRain", severity: "high" },
    ]);
  });

  it("flags wind, heat, and freezing above thresholds", () => {
    const wind = activeHazards({ dayDate: "d", precipitationMm: 0, windSpeedKmh: 90, maxTempC: 20, minTempC: 10 });
    expect(wind).toContainEqual({ hazard: "highWind", severity: "high" });
    const heat = activeHazards({ dayDate: "d", precipitationMm: 0, windSpeedKmh: 0, maxTempC: 40, minTempC: 10 });
    expect(heat).toContainEqual({ hazard: "extremeHeat", severity: "high" });
    const cold = activeHazards({ dayDate: "d", precipitationMm: 0, windSpeedKmh: 0, maxTempC: 5, minTempC: -8 });
    expect(cold).toContainEqual({ hazard: "freezing", severity: "medium" });
  });

  it("returns no hazards below thresholds", () => {
    expect(activeHazards({ dayDate: "d", precipitationMm: 5, windSpeedKmh: 20, maxTempC: 25, minTempC: 15 })).toEqual([]);
  });

  it("ignores unknown temperature values", () => {
    expect(activeHazards({ dayDate: "d", precipitationMm: 0, windSpeedKmh: 0, maxTempC: null, minTempC: null })).toEqual([]);
  });
});

describe("sensitivityAffected", () => {
  it("outdoor is affected by every hazard", () => {
    for (const hazard of ["heavyRain", "highWind", "extremeHeat", "freezing"] as const) {
      expect(sensitivityAffected("outdoor", hazard)).toBe(true);
    }
  });
  it("indoor is never affected", () => {
    expect(sensitivityAffected("indoor", "heavyRain")).toBe(false);
    expect(sensitivityAffected("indoor", "highWind")).toBe(false);
  });
  it("neutral is affected only by rain and heat", () => {
    expect(sensitivityAffected("neutral", "heavyRain")).toBe(true);
    expect(sensitivityAffected("neutral", "extremeHeat")).toBe(true);
    expect(sensitivityAffected("neutral", "highWind")).toBe(false);
    expect(sensitivityAffected("neutral", "freezing")).toBe(false);
  });
});

describe("detectConflicts", () => {
  it("flags an outdoor activity on a rainy day with a reason", () => {
    const activity = makeActivity({ id: "a1", dayDate: "2026-06-01", title: "Hiking", category: "outdoors" });
    const conflicts = detectConflicts([activity], forecastFor("2026-06-01", { precipitationSum: [35] }));
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      id: "a1:heavyRain",
      activityId: "a1",
      dayDate: "2026-06-01",
      hazard: "heavyRain",
      resolution: "reschedule",
    });
    expect(conflicts[0].reason).toContain("Hiking");
  });

  it("does not flag indoor activities", () => {
    const activity = makeActivity({ id: "a2", title: "Museum", category: "culture" });
    expect(detectConflicts([activity], forecastFor("2026-06-01", { precipitationSum: [50] }))).toEqual([]);
  });

  it("flags neutral activities for heavy rain with a swap resolution", () => {
    const activity = makeActivity({ id: "a3", title: "Free time", category: "misc" });
    const conflicts = detectConflicts([activity], forecastFor("2026-06-01", { precipitationSum: [30] }));
    expect(conflicts[0].resolution).toBe("swapIndoor");
  });

  it("does not flag an outdoor activity on a clear day", () => {
    const activity = makeActivity({ id: "a4", title: "Hiking", category: "outdoors" });
    expect(detectConflicts([activity], forecastFor("2026-06-01"))).toEqual([]);
  });

  it("produces one conflict per active hazard", () => {
    const activity = makeActivity({ id: "a5", title: "Beach day", category: "outdoors" });
    const conflicts = detectConflicts([activity], forecastFor("2026-06-01", { precipitationSum: [30], windSpeed10mMax: [70] }));
    expect(conflicts.map((c) => c.hazard).sort()).toEqual(["heavyRain", "highWind"]);
  });

  it("skips deleted activities and those without forecast data", () => {
    const deleted = makeActivity({ id: "a6", deletedAt: "2026-01-02T00:00:00Z", title: "Hiking", category: "outdoors" });
    const noData = makeActivity({ id: "a7", dayDate: "2026-06-09", title: "Hiking", category: "outdoors" });
    expect(detectConflicts([deleted, noData], forecastFor("2026-06-01", { precipitationSum: [40] }))).toEqual([]);
  });
});

describe("conflict helpers", () => {
  it("maps the worst conflict per activity", () => {
    const low = makeActivity({ id: "a1", title: "Hiking", category: "outdoors" });
    const lowConflict = { ...low, id: "a1:heavyRain", tripId: "trip-1", activityId: "a1", dayDate: "2026-06-01", hazard: "heavyRain" as const, severity: "low" as const, reason: "x", resolution: "reschedule" as const };
    const highConflict = { ...lowConflict, id: "a1:highWind", hazard: "highWind" as const, severity: "high" as const };
    const map = conflictsByActivityId([lowConflict, highConflict]);
    expect(map["a1"].hazard).toBe("highWind");
  });

  it("counts distinct impacted activities", () => {
    const base = makeActivity({ id: "a1", title: "Hiking", category: "outdoors" });
    const c1 = { ...base, id: "a1:heavyRain", tripId: "trip-1", activityId: "a1", dayDate: "2026-06-01", hazard: "heavyRain" as const, severity: "medium" as const, reason: "x", resolution: "reschedule" as const };
    const c2 = { ...base, id: "a1:highWind", activityId: "a1", hazard: "highWind" as const, severity: "medium" as const, reason: "y", resolution: "reschedule" as const };
    expect(impactedActivityCount([c1, c2])).toBe(1);
  });

  it("labels hazards for the UI", () => {
    expect(hazardLabel("heavyRain")).toBe("Rain");
    expect(hazardLabel("highWind")).toBe("Wind");
    expect(hazardLabel("extremeHeat")).toBe("Heat");
    expect(hazardLabel("freezing")).toBe("Freezing");
  });
});
