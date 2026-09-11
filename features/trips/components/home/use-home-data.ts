"use client";

import { useEffect, useMemo, useState } from "react";

import type { Activity, Contact, Trip, TripMember } from "@/features/domain/entities";
import type { VaultEntry } from "@/features/vault/domain/vault-types";
import { activityRepository } from "@/features/activities/data/dexie-activity-repository";
import { collaborationRepository } from "@/features/collaboration/data/dexie-collaboration-repository";
import { contactRepository } from "@/features/contacts/data/dexie-contact-repository";
import { tripBudgetRepository } from "@/features/finance/data/dexie-finance-repository";
import { tripRepository } from "@/features/trips/data/dexie-trip-repository";
import { vaultRepository } from "@/features/vault/data/dexie-vault-repository";
import { buildTimeline, isTripEnded, pickPrimaryTrips, todayKeyInZone, type TimelineItem } from "@/features/trips/lib/home-trips";
import { computeReadiness, type TripReadiness } from "@/features/trips/lib/readiness";

export interface HomeData {
  /** True until the first trip list has loaded (drives the skeleton). */
  loading: boolean;
  trips: Trip[];
  primaryTrip: Trip | null;
  activeTrip: Trip | null;
  nextTrip: Trip | null;
  /** Planned trips that start today or later, excluding the hero trip. */
  upNext: Trip[];
  readiness: TripReadiness | null;
  timeline: TimelineItem[];
  hasAnyTrip: boolean;
  /** True when at least one trip is completed or cancelled. */
  hasEndedTrips: boolean;
}

/**
 * Aggregates the home dashboard's data from the local-first Dexie layer.
 * Subscribes to trips, then to the featured trip's activities/members/vault and
 * the user's contacts (for passport readiness) — all via live queries, so the
 * home stays correct offline and updates in place.
 */
export function useHomeData(ownerId: string): HomeData {
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [vaultEntries, setVaultEntries] = useState<VaultEntry[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [totalBudgetMinor, setTotalBudgetMinor] = useState<bigint | null>(null);

  useEffect(() => tripRepository.watchAll(setTrips), []);

  useEffect(() => contactRepository.watch(ownerId, setContacts), [ownerId]);

  const { primaryTrip, activeTrip, nextTrip, upNext } = useMemo(
    () => pickPrimaryTrips(trips ?? []),
    [trips]
  );
  const primaryTripId = primaryTrip?.id ?? null;

  useEffect(() => {
    if (!primaryTripId) return;
    const unsubscribeActivities = activityRepository.watchByTrip(primaryTripId, setActivities);
    const unsubscribeMembers = collaborationRepository.watchMembers(primaryTripId, setMembers);
    const unsubscribeVault = vaultRepository.watchEntries(primaryTripId, ownerId, setVaultEntries);
    const unsubscribeBudget = tripBudgetRepository.watchByTrip(primaryTripId, (budget) =>
      setTotalBudgetMinor(budget?.totalBudgetMinor ?? null)
    );
    return () => {
      unsubscribeActivities();
      unsubscribeMembers();
      unsubscribeVault();
      unsubscribeBudget();
    };
  }, [primaryTripId, ownerId]);

  const readiness = useMemo<TripReadiness | null>(() => {
    if (!primaryTrip) return null;
    const travelerCount = (primaryTrip.adultCount ?? 0) + (primaryTrip.childCount ?? 0);
    return computeReadiness({
      trip: primaryTrip,
      totalBudgetMinor,
      activityCount: activities.filter((activity) => activity.deletedAt === null).length,
      memberCount: members.length,
      travelerCount,
      vaultEntryCount: vaultEntries.length,
      passportOnFile: contacts.some((contact) => Boolean(contact.passportExpiresOn)),
    });
  }, [primaryTrip, totalBudgetMinor, activities, members, vaultEntries, contacts]);

  const timeline = useMemo<TimelineItem[]>(
    () =>
      primaryTrip
        ? buildTimeline(activities, {
            scope: activeTrip ? "today" : "upcoming",
            today: todayKeyInZone(primaryTrip.timeZone),
            limit: Number.MAX_SAFE_INTEGER,
          })
        : [],
    [primaryTrip, activeTrip, activities]
  );

  return {
    loading: trips === null,
    trips: trips ?? [],
    primaryTrip,
    activeTrip,
    nextTrip,
    upNext,
    readiness,
    timeline,
    hasAnyTrip: (trips ?? []).length > 0,
    hasEndedTrips: (trips ?? []).some((trip) => isTripEnded(trip)),
  };
}
