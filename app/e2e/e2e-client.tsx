"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { activityRepository } from "@/features/activities/data/dexie-activity-repository";
import { tripRepository } from "@/features/trips/data/dexie-trip-repository";
import { TripPlannerView } from "@/features/trip-planner/components/trip-planner-view";
import { tripIdeaRepository } from "@/features/trip-planner/data/dexie-trip-planner-repository";
import {
  closeDatabase,
  getCurrentDatabase,
  getDatabase,
  setCurrentDatabase,
  subscribeToDatabaseChanges,
} from "@/lib/db/dexie";
import { configureSyncUser } from "@/lib/sync/sync-context";

const E2E_USER_ID = "e2e-user";
const E2E_PLANNER_USER_ID = "e2e-planner-user";

export function E2EClient() {
  const db = useSyncExternalStore(subscribeToDatabaseChanges, getCurrentDatabase, () => null);
  const activeUserId = useRef(E2E_USER_ID);
  const [outboxCount, setOutboxCount] = useState(0);
  const [tripId, setTripId] = useState<string | null>(null);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [convertedIdeaId, setConvertedIdeaId] = useState<string | null>(null);
  const [convertedTripId, setConvertedTripId] = useState<string | null>(null);

  useEffect(() => {
    const instance = getDatabase(E2E_USER_ID);
    setCurrentDatabase(instance);
    configureSyncUser(E2E_USER_ID);

    return () => {
      setCurrentDatabase(null);
      configureSyncUser(null);
      void closeDatabase(activeUserId.current).catch(() => {});
    };
  }, []);

  const refreshOutbox = useCallback(async () => {
    if (!db) return;
    const count = await db.outboxMutations.count();
    setOutboxCount(count);
  }, [db]);

  useEffect(() => {
    if (!db) return;
    const initial = setTimeout(refreshOutbox, 0);
    const interval = setInterval(refreshOutbox, 500);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [db, refreshOutbox]);

  async function createTrip() {
    if (!db) return;
    const trip = await tripRepository.create({
      id: crypto.randomUUID(),
      ownerId: E2E_USER_ID,
      name: "E2E Test Trip",
    });
    setTripId(trip.id);
    await refreshOutbox();
  }

  async function createActivity() {
    if (!db) return;
    await activityRepository.create({
      id: crypto.randomUUID(),
      tripId: tripId ?? "unknown",
      dayDate: "2025-01-01",
      title: "Offline activity",
      position: 1024,
      createdBy: E2E_USER_ID,
    });
    await refreshOutbox();
  }

  async function openWishlist() {
    const plannerDatabase = getDatabase(E2E_PLANNER_USER_ID);
    await plannerDatabase.open();
    activeUserId.current = E2E_PLANNER_USER_ID;
    setCurrentDatabase(plannerDatabase);
    configureSyncUser(E2E_PLANNER_USER_ID);
    setConvertedIdeaId(null);
    setConvertedTripId(null);
    setPlannerOpen(true);
  }

  async function returnToHarness() {
    const harnessDatabase = getDatabase(E2E_USER_ID);
    await harnessDatabase.open();
    activeUserId.current = E2E_USER_ID;
    setCurrentDatabase(harnessDatabase);
    configureSyncUser(E2E_USER_ID);
    setPlannerOpen(false);
  }

  async function retryConversion() {
    if (!convertedIdeaId) return;
    const trip = await tripIdeaRepository.convertToTrip(convertedIdeaId);
    setConvertedTripId(trip.id);
  }

  if (plannerOpen) {
    return (
      <main className="p-8">
        <TripPlannerView
          userId=""
          onBack={() => void returnToHarness()}
          onTripCreated={(ideaId, tripId) => {
            setConvertedIdeaId(ideaId);
            setConvertedTripId(tripId);
          }}
        />
        {convertedTripId && (
          <div className="mt-4 space-y-2">
            <p data-testid="converted-trip-id">Converted trip: {convertedTripId}</p>
            <Button type="button" onClick={() => void retryConversion()}>
              Retry conversion
            </Button>
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">E2E harness</h1>
      <div className="mt-4 flex flex-col gap-3">
        <Button onClick={() => void openWishlist()} disabled={!db}>
          Open trip wishlist
        </Button>
        <Button onClick={createTrip} disabled={!db}>
          Create trip
        </Button>
        <Button onClick={createActivity} disabled={!db || !tripId}>
          Create activity
        </Button>
      </div>
      <p className="mt-4" data-testid="trip-id">
        Trip: {tripId ?? "none"}
      </p>
      <p className="mt-2" data-testid="outbox-count">
        Outbox: {outboxCount}
      </p>
    </main>
  );
}
