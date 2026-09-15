/**
 * Weather-conflict domain contract for the Weather-Triggered Itinerary
 * Rescheduler.
 *
 * Plain TypeScript shapes with no dependency on Dexie, Supabase, or the UI.
 * The detection engine (`features/weather/lib/weather-conflict.ts`) and the
 * rescheduler (`features/weather/lib/rescheduler.ts`) are written against these
 * types, keeping rules pure and unit-testable.
 */

import type { WeatherWarningType } from "@/features/weather/domain/weather-types";

/** Reuse the weather feature's warning taxonomy for hazard types. */
export type WeatherHazardType = WeatherWarningType;

/**
 * How an activity reacts to weather. Classification is keyword-based and
 * conservative: `neutral` (the default) is only affected by heavy rain.
 */
export type ActivityWeatherSensitivity = "outdoor" | "indoor" | "neutral";

export type ConflictSeverity = "low" | "medium" | "high";

/** Which resolution a conflict leans toward (the modal offers both regardless). */
export type ConflictResolutionKind = "reschedule" | "swapIndoor";

/** A normalized per-day weather condition used by the detection rules. */
export interface WeatherCondition {
  dayDate: string;
  /** Total precipitation for the day, in mm. */
  precipitationMm: number;
  /** Max wind speed for the day, in km/h. */
  windSpeedKmh: number;
  /** Max temperature in °C, when known. */
  maxTempC: number | null;
  /** Min temperature in °C, when known. */
  minTempC: number | null;
  /** WMO weather code, when known. */
  weatherCode?: number;
}

/** A detected conflict between one activity and a weather hazard on a day. */
export interface WeatherConflict {
  /** Stable id: `${activityId}:${hazardType}`. */
  id: string;
  tripId: string;
  activityId: string;
  dayDate: string;
  hazard: WeatherHazardType;
  severity: ConflictSeverity;
  /** Human-readable explanation shown in the UI. */
  reason: string;
  resolution: ConflictResolutionKind;
}

/** Thresholds the detection engine uses to decide whether a hazard is active. */
export interface ConflictThresholds {
  heavyRainMm: number;
  highWindKmh: number;
  extremeHeatC: number;
  freezingC: number;
}

/** A suggested move of an activity to another day/slot. */
export interface RescheduleSuggestion {
  dayDate: string;
  /** ISO datetime on the target day, or null to keep the slot unset. */
  startTime: string | null;
  reason: string;
}

/** A suggested indoor replacement for an outdoor activity. */
export interface IndoorSwapSuggestion {
  title: string;
  category: string;
  description: string | null;
  reason: string;
}
