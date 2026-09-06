import type { Activity, Trip } from "@/features/domain/entities";

export const DAY_MS = 86_400_000;

/** Deep-link into a trip workspace tab (e.g. `/trips/abc?tab=itinerary`). */
export function tripTabPath(tripId: string, tab: string): string {
  return `/trips/${tripId}?tab=${tab}`;
}

/** `yyyy-mm-dd` for a given date (UTC-safe, matches how trip dates are stored). */
export function todayKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** Whole days from `today` until the given `yyyy-mm-dd` date (negative = past). */
export function daysUntil(date: string, today: Date = new Date()): number {
  const [y, m, d] = date.split("-").map(Number);
  const target = Date.UTC(y, m - 1, d);
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((target - now) / DAY_MS);
}

export function isTripActive(trip: Trip, today: Date = new Date()): boolean {
  if (!trip.startDate || !trip.endDate) return false;
  const day = todayKey(today);
  return trip.startDate <= day && trip.endDate >= day;
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
  /** The trip currently underway (today between its dates), if any. */
  activeTrip: Trip | null;
  /** The nearest upcoming trip with a start date, if any. */
  nextTrip: Trip | null;
}

/**
 * Picks the hero trip and the active/upcoming split from the user's trips.
 * Trips without a start date sort last and are ignored for "upcoming".
 */
export function pickPrimaryTrips(trips: Trip[], today: Date = new Date()): PrimaryTripSelection {
  const dated = trips.filter((trip) => trip.startDate !== null);
  dated.sort((a, b) => a.startDate!.localeCompare(b.startDate!));
  const activeTrip = dated.find((trip) => isTripActive(trip, today)) ?? null;
  const nextTrip =
    dated.find((trip) => !isTripActive(trip, today) && daysUntil(trip.startDate!, today) >= 0) ?? null;
  return { primaryTrip: activeTrip ?? nextTrip, activeTrip, nextTrip };
}

export interface TimelineItem {
  id: string;
  dayDate: string;
  title: string;
  /** `HH:MM` when the activity has a start time, otherwise null. */
  timeLabel: string | null;
  location: string | null;
  category: string;
}

function timeLabel(startTime: string | null): string | null {
  if (!startTime) return null;
  const date = new Date(startTime);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
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
  }));
}
