/**
 * Weather-conflict rescheduler.
 *
 * Turns detected weather conflicts into concrete, one-tap resolutions:
 *
 * 1. `suggestReschedule` — find a clear day (for this activity's sensitivity)
 *    to move the activity to, preserving its time slot.
 * 2. `suggestIndoorSwap` — propose a weatherproof indoor alternative matched to
 *    the activity's theme.
 * 3. `rescheduleActivity` / `swapActivityIndoor` — apply those resolutions
 *    through a dependency-injected activity repository (local-first, so writes
 *    ride the existing outbox/feed transactions).
 *
 * The suggestion functions are pure; the appliers depend only on the injected
 * repository surface, so both are trivial to unit test with fakes.
 */

import type { Activity } from "@/features/domain/entities";
import type { ActivityRepository } from "@/features/domain/repositories/activity-repository";
import type {
  ActivityWeatherSensitivity,
  ConflictThresholds,
  IndoorSwapSuggestion,
  RescheduleSuggestion,
  WeatherCondition,
} from "@/features/weather/domain/weather-conflict-types";
import {
  activeHazards,
  classifyActivitySensitivity,
  conditionFromForecast,
  sensitivityAffected,
} from "@/features/weather/lib/weather-conflict";
import type { DailyForecast } from "@/features/weather/domain/weather-types";

const DEFAULT_POSITION = 1024;

/** Position for an activity appended to the end of a target day's list. */
export function nextDayPosition(dayActivities: Array<{ position: number }>): number {
  return Math.max(0, ...dayActivities.map((item) => item.position)) + DEFAULT_POSITION;
}

/** Rebase an ISO datetime onto a different calendar day, preserving the time. */
export function shiftStartTimeToDay(isoDateTime: string | null, dayDate: string): string | null {
  if (!isoDateTime) return null;
  const date = new Date(isoDateTime);
  if (Number.isNaN(date.getTime())) return null;
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${dayDate}T${hours}:${minutes}:00`;
}

/** Build a day-date → condition map for a set of trip days. */
export function conditionsByDate(
  forecast: DailyForecast | undefined,
  tripDays: string[],
): Record<string, WeatherCondition> {
  const map: Record<string, WeatherCondition> = {};
  for (const day of tripDays) {
    const condition = conditionFromForecast(forecast, day);
    if (condition) map[day] = condition;
  }
  return map;
}

function isDayClear(
  dayDate: string,
  sensitivity: ActivityWeatherSensitivity,
  conditions: Record<string, WeatherCondition>,
  thresholds: ConflictThresholds,
): boolean {
  const condition = conditions[dayDate];
  if (!condition) return true; // no data → assume clear
  return activeHazards(condition, thresholds).every(
    ({ hazard }) => !sensitivityAffected(sensitivity, hazard),
  );
}

/**
 * Find a clear day to move an outdoor activity to. Prefers a later day, then
 * the earliest clear day, and keeps the original time slot. Returns null when
 * no clear day exists on the trip.
 */
export function suggestReschedule(
  activity: Activity,
  tripDays: string[],
  conditions: Record<string, WeatherCondition>,
  thresholds: ConflictThresholds,
): RescheduleSuggestion | null {
  const sensitivity = classifyActivitySensitivity(activity);
  const candidates = tripDays.filter((day) => day !== activity.dayDate);
  // Later days first (weather often improves), then the rest.
  const ordered = [...candidates].sort((a, b) => a.localeCompare(b));
  const target = ordered.find((day) => isDayClear(day, sensitivity, conditions, thresholds));
  if (!target) return null;
  return {
    dayDate: target,
    startTime: shiftStartTimeToDay(activity.startTime, target),
    reason: `Move to ${formatDay(target)} to avoid the weather.`,
  };
}

const INDOOR_SWAP_CATALOG: Array<{ match: RegExp; suggestion: IndoorSwapSuggestion }> = [
  {
    match: /hiking|trek|mountain|climb|camp|outdoor|adventure|safari|expedition/i,
    suggestion: {
      title: "Indoor climbing gym",
      category: "indoor",
      description: "Keep the adventure going without the weather.",
      reason: "Swap your outdoor adventure for an indoor climbing session.",
    },
  },
  {
    match: /beach|swim|snorkel|dive|surf|sail|kayak|paddle|boat|cruise|water|pool/i,
    suggestion: {
      title: "Aquarium visit",
      category: "indoor",
      description: "See marine life up close, rain or shine.",
      reason: "Swap your water plan for an indoor aquarium visit.",
    },
  },
  {
    match: /sightsee|walk|tour|park|garden|excursion/i,
    suggestion: {
      title: "Museum visit",
      category: "indoor",
      description: "A weatherproof way to explore the local history.",
      reason: "Swap your walking tour for an indoor museum visit.",
    },
  },
  {
    match: /cycl|bike|run|jog|sport|golf|tennis|football|soccer|baseball|hockey/i,
    suggestion: {
      title: "Indoor sports center",
      category: "indoor",
      description: "Stay active with covered courts and facilities.",
      reason: "Swap your outdoor activity for an indoor sports center.",
    },
  },
  {
    match: /family|kids|children|zoo|theme park|amuse/i,
    suggestion: {
      title: "Indoor play center",
      category: "indoor",
      description: "Plenty of room for the family to run around indoors.",
      reason: "Swap for an indoor play center that suits the whole family.",
    },
  },
  {
    match: /nature|wildlife|picnic|botanical/i,
    suggestion: {
      title: "Art gallery",
      category: "indoor",
      description: "A calming indoor alternative to the outdoors.",
      reason: "Swap your nature plan for a local art gallery.",
    },
  },
];

/** Propose an indoor alternative matched to the activity's theme. */
export function suggestIndoorSwap(activity: Pick<Activity, "category" | "title">): IndoorSwapSuggestion {
  const haystack = `${activity.category} ${activity.title}`;
  for (const rule of INDOOR_SWAP_CATALOG) {
    if (rule.match.test(haystack)) return rule.suggestion;
  }
  return {
    title: "Museum visit",
    category: "indoor",
    description: "A weatherproof way to spend the afternoon.",
    reason: "Swap to an indoor museum visit.",
  };
}

/** Minimal repository surface the rescheduler appliers depend on. */
export interface ReschedulerDeps {
  activity: Pick<ActivityRepository, "move" | "update">;
}

export interface RescheduleTarget {
  dayDate: string;
  startTime: string | null;
  position?: number;
}

/** Persist a reschedule by moving the activity and adjusting its time slot. */
export async function rescheduleActivity(
  activity: Activity,
  target: RescheduleTarget,
  deps: ReschedulerDeps,
): Promise<void> {
  if (target.dayDate !== activity.dayDate) {
    await deps.activity.move(activity.id, target.dayDate, target.position ?? DEFAULT_POSITION);
  }
  if (target.startTime !== activity.startTime) {
    await deps.activity.update(activity.id, { startTime: target.startTime });
  }
}

/** Persist an indoor swap by replacing the activity's title/category/description. */
export async function swapActivityIndoor(
  activity: Activity,
  swap: IndoorSwapSuggestion,
  deps: ReschedulerDeps,
): Promise<void> {
  await deps.activity.update(activity.id, {
    title: swap.title,
    category: swap.category,
    description: swap.description ?? activity.description,
  });
}

function formatDay(dayDate: string): string {
  return new Date(`${dayDate}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
