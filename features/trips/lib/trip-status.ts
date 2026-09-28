import type { TripStatus } from "@/features/domain/entities";

/** Traveler-local `yyyy-mm-dd`. Trip dates are calendar days, not UTC instants. */
export function calendarDay(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Effective lifecycle state of a trip.
 *
 * `active`, `completed`, and `cancelled` are respected as stored. A stored
 * `planned` status falls back to the date-derived behavior (a trip is treated
 * as underway when the local calendar day is within its start/end dates) so
 * existing records without an explicit status keep working. The stored status
 * is only ever changed by explicit user action (`startTrip` / `endTrip` /
 * `cancelTrip`).
 */
export function resolveTripStatus(
  trip: { status?: TripStatus | null; startDate?: string | null; endDate?: string | null },
  today: Date = new Date()
): TripStatus {
  const stored = trip.status ?? "planned";
  if (stored !== "planned") return stored;

  if (trip.startDate && trip.endDate) {
    const day = calendarDay(today);
    if (trip.startDate <= day && trip.endDate >= day) return "active";
  }
  return "planned";
}
