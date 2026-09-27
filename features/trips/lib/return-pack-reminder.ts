import { notificationRepository } from "@/features/notifications/data/dexie-notification-repository";
import type { Trip } from "@/features/domain/entities";
import { getCurrentDatabase } from "@/lib/db/dexie";
import { logger } from "@/lib/observability/logger";
import { resolveTripScheduleTimeZone, todayKeyInZone } from "@/features/trips/lib/home-trips";
import { resolveTripStatus } from "@/features/trips/lib/trip-status";

const RETURN_SUFFIX = "_return";

/**
 * Local reference for the end-of-trip reminder.
 * The start-of-trip alert already uses the bare trip id with type `trip_alert`,
 * so this suffix keeps the two rows distinct. It is not written to the outbox:
 * the remote `reference_id` column is a uuid and would reject this value.
 */
export function returnPackReferenceId(tripId: string): string {
  return `${tripId}${RETURN_SUFFIX}`;
}

/** Trip id used by notification links. Strips the return-reminder suffix. */
export function tripIdFromNotificationReference(referenceId: string): string {
  return referenceId.endsWith(RETURN_SUFFIX) ? referenceId.slice(0, -RETURN_SUFFIX.length) : referenceId;
}

/**
 * Queue one local "pack for home" alert when an active trip's end date is today
 * in the trip timezone. A second call for the same trip does nothing.
 */
export async function queueReturnPackReminder(input: {
  userId: string;
  trip: Trip;
  message: string;
  now?: Date;
}): Promise<boolean> {
  const db = getCurrentDatabase();
  if (!db) return false;
  const { userId, trip, message } = input;
  if (resolveTripStatus(trip, input.now) !== "active" || !trip.endDate) return false;
  const today = todayKeyInZone(resolveTripScheduleTimeZone(trip), input.now ?? new Date());
  if (trip.endDate !== today) return false;

  const referenceId = returnPackReferenceId(trip.id);
  try {
    const existing = await db.notifications.where("userId").equals(userId).toArray();
    if (existing.some((item) => item.type === "trip_alert" && item.referenceId === referenceId)) return false;
    await notificationRepository.create({
      userId,
      type: "trip_alert",
      referenceId,
      message,
    });
    return true;
  } catch (cause) {
    logger.debug("Return pack reminder skipped", {
      tripId: trip.id,
      error: cause instanceof Error ? cause.message : "unknown",
    });
    return false;
  }
}
