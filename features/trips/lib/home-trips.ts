import type { Activity, ActivityChecklistItem, ActivityParticipant, Trip } from "@/features/domain/entities";
import { normalizeActivityChecklist } from "@/features/activities/domain/activity-checklist";
import { resolveTripStatus } from "@/features/trips/lib/trip-status";
import { isUserAttending } from "@/features/trips/lib/activity-category-colors";

export const DAY_MS = 86_400_000;

/** Deep-link into a trip workspace tab (e.g. `/trips/abc?tab=itinerary`). */
export function tripTabPath(tripId: string, tab: string): string {
  return `/trips/${tripId}?tab=${tab}`;
}

/** Deep-link that opens the itinerary activity editor for a specific activity. */
export function tripActivityEditPath(tripId: string, activityId: string): string {
  return `/trips/${tripId}?tab=itinerary&action=edit-activity&activityId=${encodeURIComponent(activityId)}`;
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
  description: string | null;
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
  /** Ordered activity checklist items for on-the-go progress tracking. */
  checklist: ActivityChecklistItem[];
  /** Participant snapshots retained for the activity detail attendees section. */
  participants?: ActivityParticipant[];
}

function timeLabel(startTime: string | null): string | null {
  if (!startTime) return null;
  // Activity schedules are wall clocks; keep HH:MM even when sync added a "Z".
  const match = startTime.match(/T(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : null;
}

/** Format an activity schedule time as trip-local HH:MM (ignores false "Z" suffixes). */
export function formatWallClockTime(startTime: string | null): string | null {
  return timeLabel(startTime);
}

/** Timezone-aware time formatter — returns HH:MM for schedule strings. */
export function formatTimeInZone(startTime: string | null, timeZone?: string | null): string | null {
  if (!startTime) return null;
  // Activity schedules are trip-local wall clocks. A trailing "Z" from sync does
  // not make them absolute UTC — always read the HH:MM digits.
  const match = startTime.match(/T(\d{2}):(\d{2})/);
  if (match) return `${match[1]}:${match[2]}`;
  const date = new Date(startTime);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: timeZone ?? undefined,
    });
  } catch {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  }
}

/**
 * Convert an activity schedule string into an absolute `Date`.
 *
 * Schedule values are authored as trip-local wall clocks (e.g. "15:15"). After a
 * Supabase round-trip they often gain a "Z" suffix even though the digits still
 * mean destination-local time. Digits are projected into `timeZone` (or the
 * device zone when omitted) — never treated as absolute UTC.
 */
export function activityDateTime(value: string, dayDate: string, timeZone?: string | null): Date {
  const match = value.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return new Date(NaN);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? 0);
  const [year, month, day] = dayDate.split("-").map(Number);
  if (!year || !month || !day || Number.isNaN(hour) || Number.isNaN(minute)) return new Date(NaN);

  const zone = resolveScheduleTimeZone(timeZone);
  const desired = Date.UTC(year, month - 1, day, hour, minute, second);
  let instant = desired;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
      timeZone: zone,
    }).formatToParts(new Date(instant));
    const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value ?? 0);
    const represented = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
    instant += desired - represented;
  }
  return new Date(instant);
}

/** Prefer the trip zone; otherwise the device zone so wall clocks match the traveler. */
export function resolveScheduleTimeZone(timeZone?: string | null): string {
  if (timeZone) return timeZone;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Destination-local calendar day + minutes-since-midnight for `date`. */
export function zonedWallClock(
  date: Date,
  timeZone?: string | null,
): { dayDate: string; minutes: number } {
  const zone = resolveScheduleTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "0";
  return {
    dayDate: `${value("year")}-${value("month")}-${value("day")}`,
    minutes: Number(value("hour")) * 60 + Number(value("minute")),
  };
}

function scheduleWallMinutes(value: string): number | null {
  const match = value.match(/T(\d{2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Temporal state of an activity relative to `now`. */
export type TemporalState = "past" | "current" | "future";

function addCalendarDays(dayDate: string, days: number): string {
  const [year, month, day] = dayDate.split("-").map(Number);
  const utc = Date.UTC(year, month - 1, day + days);
  const date = new Date(utc);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Classify past/current/future by comparing schedule wall-clock digits to "now"
 * expressed in the destination (or device) timezone. Trailing "Z" is ignored —
 * digits are never treated as absolute UTC.
 */
export function getTemporalState(
  activity: { startTime: string | null; endTime?: string | null; dayDate: string },
  now: Date,
  timeZone?: string | null
): TemporalState {
  if (!activity.startTime) return "future";
  const startMinutes = scheduleWallMinutes(activity.startTime);
  if (startMinutes == null) return "future";

  const endMinutesRaw = activity.endTime ? scheduleWallMinutes(activity.endTime) : null;
  const durationMinutes =
    endMinutesRaw == null
      ? 30
      : endMinutesRaw > startMinutes
        ? endMinutesRaw - startMinutes
        : endMinutesRaw + 24 * 60 - startMinutes;
  const endExclusive = startMinutes + Math.max(durationMinutes, 1);
  const crossesMidnight = endExclusive > 24 * 60;

  const nowWall = zonedWallClock(now, timeZone);
  const dayCmp = activity.dayDate.localeCompare(nowWall.dayDate);

  if (!crossesMidnight) {
    if (dayCmp < 0) return "past";
    if (dayCmp > 0) return "future";
    if (nowWall.minutes < startMinutes) return "future";
    if (nowWall.minutes >= endExclusive) return "past";
    return "current";
  }

  // Spans midnight: live from start on dayDate through (endExclusive % day) on the next day.
  const endOnNextDay = endExclusive - 24 * 60;
  if (dayCmp > 0) return "future";
  if (dayCmp === 0) {
    return nowWall.minutes < startMinutes ? "future" : "current";
  }
  if (nowWall.dayDate === addCalendarDays(activity.dayDate, 1) && nowWall.minutes < endOnNextDay) {
    return "current";
  }
  return "past";
}

/** Infer an IANA zone from a free-text destination when `trip.timeZone` is missing. */
export function inferTimeZoneFromDestination(destination?: string | null): string | null {
  const value = destination?.toLowerCase() ?? "";
  if (!value) return null;
  if (
    value.includes("mexico") ||
    value.includes("méxico") ||
    value.includes("cdmx") ||
    value.includes("ciudad de mexico") ||
    value.includes("ciudad de méxico") ||
    value.includes("guadalajara") ||
    value.includes("monterrey") ||
    value.includes("cancun") ||
    value.includes("cancún") ||
    value.includes("oaxaca") ||
    value.includes("puebla") ||
    value.includes("tijuana")
  ) {
    return "America/Mexico_City";
  }
  if (value.includes("lisbon") || value.includes("lisboa")) return "Europe/Lisbon";
  if (value.includes("tokyo") || value.includes("kyoto")) return "Asia/Tokyo";
  if (value.includes("torres del paine") || value.includes("patagonia")) return "America/Punta_Arenas";
  return null;
}

/**
 * Schedule timezone for a trip: destination inference, then stored `timeZone`,
 * then the device zone. Destination wins so a stale remote `timeZone` cannot
 * mark evening stops as ended for a traveler in the real destination.
 */
export function resolveTripScheduleTimeZone(trip: {
  timeZone?: string | null;
  destination?: string | null;
}): string {
  return (
    inferTimeZoneFromDestination(trip.destination) ??
    trip.timeZone ??
    resolveScheduleTimeZone(null)
  );
}

/**
 * Builds the chronological timeline feed for a trip. Active trips retain past
 * activities so the Home window can show ended context and reveal earlier
 * items above; callers control the visible window and item limit.
 *
 * Participation: hide only activities the user has declined / is not attending
 * when a participants list exists. Empty participants means the stop is open to
 * the whole trip (legacy + Scout creates), so it stays visible on Home.
 */
export function buildTimeline(
  activities: Activity[],
  options: { scope: "today" | "upcoming"; today: string; limit: number; currentUserId: string }
): TimelineItem[] {
  const { limit, currentUserId } = options;
  const sorted = [...activities]
    .filter((activity) => activity.deletedAt === null && isUserAttending(activity, currentUserId))
    .sort((a, b) => {
      const dateCmp = a.dayDate.localeCompare(b.dayDate);
      if (dateCmp !== 0) return dateCmp;
      const aTime = a.startTime ?? "";
      const bTime = b.startTime ?? "";
      if (aTime !== bTime) return aTime.localeCompare(bTime);
      return a.position - b.position;
    });

  return sorted.slice(0, limit).map((activity) => ({
    id: activity.id,
    dayDate: activity.dayDate,
    title: activity.title,
    description: activity.description?.trim() ? activity.description.trim() : null,
    timeLabel: timeLabel(activity.startTime),
    location: activity.formattedAddress ?? activity.placeName ?? activity.location ?? null,
    category: activity.category,
    startTime: activity.startTime,
    endTime: activity.endTime,
    tripId: activity.tripId,
    checklist: normalizeActivityChecklist(activity.checklist),
    participants: activity.participants ?? [],
  }));
}
