import type { Activity, Trip } from "@/features/domain/entities";
import { resolveTripStatus } from "@/features/trips/lib/trip-status";

export const DAY_MS = 86_400_000;

/** Deep-link into a trip workspace tab (e.g. `/trips/abc?tab=itinerary`). */
export function tripTabPath(tripId: string, tab: string): string {
  return `/trips/${tripId}?tab=${tab}`;
}

/** `yyyy-mm-dd` for a given date (UTC-safe, matches how trip dates are stored). */
export function todayKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function todayKeyInZone(timeZone: string | null | undefined, date: Date = new Date()): string {
  if (!timeZone) return todayKey(date);
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone }).formatToParts(date);
    const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
    return `${value("year")}-${value("month")}-${value("day")}`;
  } catch {
    return todayKey(date);
  }
}

/** Whole days from `today` until the given `yyyy-mm-dd` date (negative = past). */
export function daysUntil(date: string, today: Date = new Date()): number {
  const [y, m, d] = date.split("-").map(Number);
  const target = Date.UTC(y, m - 1, d);
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((target - now) / DAY_MS);
}

export function isTripActive(trip: Trip, today: Date = new Date()): boolean {
  return resolveTripStatus(trip, today) === "active";
}

/** A trip is "ended" when it is `completed` or `cancelled`. */
export function isTripEnded(trip: Trip, today: Date = new Date()): boolean {
  const status = resolveTripStatus(trip, today);
  return status === "completed" || status === "cancelled";
}

/** A trip is "upcoming" when it is planned and starts today or later. */
export function isTripUpcoming(trip: Trip, today: Date = new Date()): boolean {
  if (resolveTripStatus(trip, today) !== "planned") return false;
  return trip.startDate !== null && daysUntil(trip.startDate, today) >= 0;
}

/** Human countdown for the hero, e.g. "14 days left" or "Today". */
export function formatCountdown(startDate: string, today: Date = new Date()): string {
  const days = daysUntil(startDate, today);
  if (days === 0) return "Today";
  if (days < 0) return "Started";
  return `${days} day${days === 1 ? "" : "s"} left`;
}

export interface PrimaryTripSelection {
  /** The trip to feature in the hero: the active trip, else the nearest upcoming. */
  primaryTrip: Trip | null;
  /** The trip currently underway, if any. */
  activeTrip: Trip | null;
  /** The nearest upcoming trip with a start date, if any. */
  nextTrip: Trip | null;
  /**
   * Planned trips that start today or later, excluding the hero trip. Rendered
   * as the "Up Next" rail — and only when the hero is in the planned state.
   */
  upNext: Trip[];
}

/**
 * Picks the hero trip and the active/upcoming split from the user's trips.
 * Ended trips (completed/cancelled) are excluded entirely. A trip is "active"
 * when its resolved status is active; otherwise the nearest upcoming planned
 * trip becomes the hero. Trips without a start date are ignored for "upcoming".
 */
export function pickPrimaryTrips(trips: Trip[], today: Date = new Date()): PrimaryTripSelection {
  const activeTrip = trips.find((trip) => isTripActive(trip, today)) ?? null;
  const upcoming = trips
    .filter((trip) => isTripUpcoming(trip, today))
    .sort((a, b) => a.startDate!.localeCompare(b.startDate!));
  const primaryTrip = activeTrip ?? upcoming[0] ?? null;
  const upNext = upcoming.filter((trip) => trip.id !== primaryTrip?.id);
  return { primaryTrip, activeTrip, nextTrip: upcoming[0] ?? null, upNext };
}

export interface TimelineItem {
  id: string;
  dayDate: string;
  title: string;
  /** `HH:MM` when the activity has a start time, otherwise null. */
  timeLabel: string | null;
  location: string | null;
  category: string;
  /** ISO datetime string for the activity start (used for timezone-aware formatting). */
  startTime?: string | null;
  /** ISO datetime string for the activity end. */
  endTime?: string | null;
  /** Trip ID for deep-linking. */
  tripId?: string;
}

function timeLabel(startTime: string | null): string | null {
  if (!startTime) return null;
  const date = new Date(startTime);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** Timezone-aware time formatter — returns HH:MM in the destination's timezone. */
export function formatTimeInZone(startTime: string | null, timeZone?: string | null): string | null {
  if (!startTime) return null;
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(startTime)) {
    const match = startTime.match(/T(\d{2}):(\d{2})/);
    return match ? `${match[1]}:${match[2]}` : null;
  }
  const date = new Date(startTime);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: timeZone ?? undefined });
  } catch {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  }
}

export function activityDateTime(value: string, dayDate: string, timeZone?: string | null): Date {
  const normalized = value.slice(0, 10) === dayDate ? value : `${dayDate}${value.slice(10)}`;
  if (/(?:Z|[+-]\d{2}:\d{2})$/.test(normalized) || !timeZone) return new Date(normalized);
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return new Date(NaN);
  const desired = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6] ?? 0));
  let instant = desired;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZone }).formatToParts(new Date(instant));
    const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value ?? 0);
    const represented = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
    instant += desired - represented;
  }
  return new Date(instant);
}

/** Temporal state of an activity relative to `now`. */
export type TemporalState = "past" | "current" | "future";

/**
 * Determine if an activity is `past`, `current`, or `future` relative to `now`.
 * - `current`: the immediate next activity that has started but not yet ended,
 *   or the very next activity if none have started yet.
 * - `past`: activities that have already ended (or started without end time, 30 min after start).
 * - `future`: everything else.
 */
export function getTemporalState(
  activity: { startTime: string | null; endTime?: string | null; dayDate: string },
  now: Date,
  timeZone?: string | null
): TemporalState {
  if (!activity.startTime) return "future";
  const start = activityDateTime(activity.startTime, activity.dayDate, timeZone);
  if (Number.isNaN(start.getTime())) return "future";

  const originalStart = new Date(activity.startTime);
  const originalEnd = activity.endTime ? new Date(activity.endTime) : null;
  const explicitDuration = originalEnd && !Number.isNaN(originalEnd.getTime()) && !Number.isNaN(originalStart.getTime())
    ? originalEnd.getTime() - originalStart.getTime()
    : null;
  const end = new Date(start.getTime() + (explicitDuration && explicitDuration > 0 ? explicitDuration : 30 * 60 * 1000));
  if (Number.isNaN(end.getTime())) return "future";

  if (now < start) return "future";
  if (now >= end) return "past";
  return "current";
}

/**
 * Builds the timeline feed for a trip. `scope` picks whether to surface only the
 * current day's items (active trip) or the next `limit` chronological items.
 */
export function buildTimeline(
  activities: Activity[],
  options: { scope: "today" | "upcoming"; today: string; limit: number }
): TimelineItem[] {
  const { scope, today, limit } = options;
  const sorted = [...activities]
    .filter((activity) => activity.deletedAt === null)
    .sort((a, b) => {
      const dateCmp = a.dayDate.localeCompare(b.dayDate);
      if (dateCmp !== 0) return dateCmp;
      const aTime = a.startTime ?? "";
      const bTime = b.startTime ?? "";
      if (aTime !== bTime) return aTime.localeCompare(bTime);
      return a.position - b.position;
    });

  const scoped = scope === "today" ? sorted.filter((activity) => activity.dayDate === today) : sorted;

  return scoped.slice(0, limit).map((activity) => ({
    id: activity.id,
    dayDate: activity.dayDate,
    title: activity.title,
    timeLabel: timeLabel(activity.startTime),
    location: activity.location,
    category: activity.category,
    startTime: activity.startTime,
    endTime: activity.endTime,
    tripId: activity.tripId,
  }));
}
