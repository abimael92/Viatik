import type { TripStatus } from "@/features/domain/entities";

/**
 * Effective lifecycle state of a trip.
 *
 * `active`, `completed`, and `cancelled` are respected as stored. A stored
 * `planned` status falls back to the date-derived behavior (a trip is treated
 * as underway when today is within its start/end dates) so existing records
 * without an explicit status keep working. The stored status is only ever
 * changed by explicit user action (`startTrip` / `endTrip` / `cancelTrip`).
 */
export function resolveTripStatus(
  trip: { status?: TripStatus | null; startDate?: string | null; endDate?: string | null },
  today: Date = new Date()
): TripStatus {
  const stored = trip.status ?? "planned";
  if (stored !== "planned") return stored;

  if (trip.startDate && trip.endDate) {
    const day = today.toISOString().slice(0, 10);
    if (trip.startDate <= day && trip.endDate >= day) return "active";
  }
  return "planned";
}
