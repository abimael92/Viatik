"use client";

import { useEffect, useMemo, useState } from "react";

import type { Activity, Contact, Trip } from "@/features/domain/entities";
import { activityRepository } from "@/features/activities/data/dexie-activity-repository";
import { contactRepository } from "@/features/contacts/data/dexie-contact-repository";
import { tripRepository } from "@/features/trips/data/dexie-trip-repository";

/** Activities fan-out cap: the 20 most recent trips by start date. */
export const PALETTE_ACTIVITY_TRIP_CAP = 20;

export interface PaletteData {
  trips: Trip[];
  /** Live activity lists keyed by trip id, for the capped trip set. */
  activitiesByTrip: Record<string, Activity[]>;
  contacts: Contact[];
}

function isLive(row: { deletedAt: string | null }): boolean {
  return row.deletedAt === null;
}

/**
 * Live palette data. Subscribes only while `enabled` (the palette view) and
 * disposes every liveQuery on close/unmount. There is no `watchAll` for
 * activities, so they fan out per trip, capped to the 20 most recent.
 */
export function usePaletteData(enabled: boolean, userId: string): PaletteData {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [activitiesByTrip, setActivitiesByTrip] = useState<Record<string, Activity[]>>({});
  const [contacts, setContacts] = useState<Contact[]>([]);

  useEffect(() => {
    if (!enabled) return;
    return tripRepository.watchAll(setTrips);
  }, [enabled]);

  const activityTripIds = useMemo(
    () =>
      trips
        .filter(isLive)
        .sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""))
        .slice(0, PALETTE_ACTIVITY_TRIP_CAP)
        .map((trip) => trip.id)
        .join(","),
    [trips]
  );

  // Clear stale per-trip activities when the capped trip set changes (render-time
  // reset — subscriptions are re-created by the effect below).
  const [prevTripIds, setPrevTripIds] = useState(activityTripIds);
  if (prevTripIds !== activityTripIds) {
    setPrevTripIds(activityTripIds);
    setActivitiesByTrip({});
  }

  useEffect(() => {
    if (!enabled) return;
    const stops = activityTripIds
      .split(",")
      .filter(Boolean)
      .map((tripId) =>
        activityRepository.watchByTrip(tripId, (activities) =>
          setActivitiesByTrip((prev) => ({ ...prev, [tripId]: activities }))
        )
      );
    return () => {
      for (const stop of stops) stop();
    };
  }, [enabled, activityTripIds]);

  useEffect(() => {
    if (!enabled) return;
    return contactRepository.watch(userId, setContacts);
  }, [enabled, userId]);

  return { trips, activitiesByTrip, contacts };
}
