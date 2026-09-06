/**
 * Weather-conflict detection engine.
 *
 * Pure, deterministic rules that cross-reference scheduled activities against
 * the trip's cached daily forecast and decide whether an activity is at risk
 * from rain, wind, or extreme temperatures. Classification is keyword-based and
 * deliberately conservative:
 *
 * - `outdoor` activities are affected by every hazard;
 * - `indoor` activities are never flagged;
 * - `neutral` (the default) is only flagged for heavy rain / extreme heat.
 *
 * Side-effect free so it is trivial to unit test. The rescheduler
 * (`rescheduler.ts`) turns the resulting conflicts into actionable moves.
 */

import type { Activity } from "@/features/domain/entities";
import type { DailyForecast } from "@/features/weather/domain/weather-types";
import type {
  ActivityWeatherSensitivity,
  ConflictSeverity,
  ConflictThresholds,
  WeatherCondition,
  WeatherConflict,
  WeatherHazardType,
} from "@/features/weather/domain/weather-conflict-types";

export const DEFAULT_CONFLICT_THRESHOLDS: ConflictThresholds = {
  heavyRainMm: 20,
  highWindKmh: 50,
  extremeHeatC: 35,
  freezingC: 0,
};

const OUTDOOR_PATTERNS: RegExp[] = [
  /hiking|trek|trail|mountaine?|climb|camp|outdoor|adventure|safari|expedition/i,
  /beach|swim|snorkel|dive|surf|sail|kayak|paddle|boat|cruise|water|waterfall|pool/i,
  /walk|sightsee|tour|excursion|park|garden|picnic/i,
  /cycl|bike|run|jog|sport|golf|tennis|football|soccer|baseball|hockey/i,
  /zoo|wildlife|theme park|amuse|botanical/i,
];

const INDOOR_PATTERNS: RegExp[] = [
  /museum|gallery|indoor|theat(er|re)|cinema|movie|performance|concert|show/i,
  /shopping|mall|market|shop/i,
  /cook(ing)? class|restaurant|dinner|tasting|food/i,
  /spa|gym|fitness|aquarium|library|arcade/i,
];

/** Which hazard types affect each sensitivity. */
const HAZARD_SENSITIVITY: Record<WeatherHazardType, ActivityWeatherSensitivity[]> = {
  heavyRain: ["outdoor", "neutral"],
  highWind: ["outdoor"],
  extremeHeat: ["outdoor", "neutral"],
  freezing: ["outdoor"],
};

const SEVERITY_RANK: Record<ConflictSeverity, number> = { low: 0, medium: 1, high: 2 };

function matches(patterns: RegExp[], text: string): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

/** Classify an activity as outdoor, indoor, or neutral based on its category/title. */
export function classifyActivitySensitivity(input: {
  category: string;
  title: string;
}): ActivityWeatherSensitivity {
  const haystack = `${input.category} ${input.title}`;
  if (matches(OUTDOOR_PATTERNS, haystack)) return "outdoor";
  if (matches(INDOOR_PATTERNS, haystack)) return "indoor";
  return "neutral";
}

/** Extract a normalized per-day weather condition from a cached forecast. */
export function conditionFromForecast(
  forecast: DailyForecast | undefined,
  dayDate: string,
): WeatherCondition | undefined {
  if (!forecast) return undefined;
  const index = forecast.dates.indexOf(dayDate);
  if (index === -1) return undefined;
  const maxTempC = forecast.temperature2mMax[index];
  const minTempC = forecast.temperature2mMin[index];
  return {
    dayDate,
    precipitationMm: forecast.precipitationSum[index] ?? 0,
    windSpeedKmh: forecast.windSpeed10mMax[index] ?? 0,
    maxTempC: Number.isFinite(maxTempC) ? maxTempC : null,
    minTempC: Number.isFinite(minTempC) ? minTempC : null,
    weatherCode: forecast.weatherCode[index] ?? -1,
  };
}

/** Determine which hazards are active for a day's weather, with severity. */
export function activeHazards(
  condition: WeatherCondition,
  thresholds: ConflictThresholds = DEFAULT_CONFLICT_THRESHOLDS,
): Array<{ hazard: WeatherHazardType; severity: ConflictSeverity }> {
  const hazards: Array<{ hazard: WeatherHazardType; severity: ConflictSeverity }> = [];
  if (condition.precipitationMm > thresholds.heavyRainMm) {
    hazards.push({
      hazard: "heavyRain",
      severity: condition.precipitationMm > 40 ? "high" : "medium",
    });
  }
  if (condition.windSpeedKmh > thresholds.highWindKmh) {
    hazards.push({
      hazard: "highWind",
      severity: condition.windSpeedKmh > 80 ? "high" : "medium",
    });
  }
  if (condition.maxTempC != null && condition.maxTempC > thresholds.extremeHeatC) {
    hazards.push({
      hazard: "extremeHeat",
      severity: condition.maxTempC > 38 ? "high" : "medium",
    });
  }
  if (condition.minTempC != null && condition.minTempC < thresholds.freezingC) {
    hazards.push({
      hazard: "freezing",
      severity: condition.minTempC <= -5 ? "medium" : "low",
    });
  }
  return hazards;
}

export function sensitivityAffected(
  sensitivity: ActivityWeatherSensitivity,
  hazard: WeatherHazardType,
): boolean {
  return HAZARD_SENSITIVITY[hazard].includes(sensitivity);
}

function describeHazard(hazard: WeatherHazardType, condition: WeatherCondition): string {
  switch (hazard) {
    case "heavyRain":
      return `Heavy rain (${Math.round(condition.precipitationMm)} mm)`;
    case "highWind":
      return `High wind (${Math.round(condition.windSpeedKmh)} km/h)`;
    case "extremeHeat":
      return `Extreme heat (${Math.round(condition.maxTempC ?? 0)}°C)`;
    case "freezing":
      return `Freezing temperatures (${Math.round(condition.minTempC ?? 0)}°C)`;
  }
}

function buildReason(title: string, hazard: WeatherHazardType, condition: WeatherCondition): string {
  return `${describeHazard(hazard, condition)} expected — this may disrupt "${title}".`;
}

export function conflictId(activityId: string, hazard: WeatherHazardType): string {
  return `${activityId}:${hazard}`;
}

/**
 * Scan all non-deleted activities against the cached forecast and return the
 * weather conflicts that should be surfaced to the user.
 */
export function detectConflicts(
  activities: Activity[],
  forecast: DailyForecast | undefined,
  thresholds: ConflictThresholds = DEFAULT_CONFLICT_THRESHOLDS,
): WeatherConflict[] {
  const conflicts: WeatherConflict[] = [];
  for (const activity of activities) {
    if (activity.deletedAt) continue;
    const condition = conditionFromForecast(forecast, activity.dayDate);
    if (!condition) continue;
    const sensitivity = classifyActivitySensitivity(activity);
    if (sensitivity === "indoor") continue;
    const resolution = sensitivity === "neutral" ? "swapIndoor" : "reschedule";
    for (const { hazard, severity } of activeHazards(condition, thresholds)) {
      if (!sensitivityAffected(sensitivity, hazard)) continue;
      conflicts.push({
        id: conflictId(activity.id, hazard),
        tripId: activity.tripId,
        activityId: activity.id,
        dayDate: activity.dayDate,
        hazard,
        severity,
        reason: buildReason(activity.title, hazard, condition),
        resolution,
      });
    }
  }
  return conflicts;
}

/** Map of the worst conflict per activity id, for badge lookup. */
export function conflictsByActivityId(
  conflicts: WeatherConflict[],
): Record<string, WeatherConflict> {
  const map: Record<string, WeatherConflict> = {};
  for (const conflict of conflicts) {
    const existing = map[conflict.activityId];
    if (!existing || SEVERITY_RANK[conflict.severity] > SEVERITY_RANK[existing.severity]) {
      map[conflict.activityId] = conflict;
    }
  }
  return map;
}

/** Number of distinct activities impacted by any conflict. */
export function impactedActivityCount(conflicts: WeatherConflict[]): number {
  return Object.keys(conflictsByActivityId(conflicts)).length;
}

/** Short human label for a hazard, used by badges and the banner. */
export function hazardLabel(hazard: WeatherHazardType): string {
  switch (hazard) {
    case "heavyRain":
      return "Rain";
    case "highWind":
      return "Wind";
    case "extremeHeat":
      return "Heat";
    case "freezing":
      return "Freezing";
  }
}
