"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { activityRepository } from "@/features/activities/data/dexie-activity-repository";
import { tripRepository } from "@/features/trips/data/dexie-trip-repository";
import { closeDatabase, getCurrentDatabase, getDatabase, setCurrentDatabase, subscribeToDatabaseChanges } from "@/lib/db/dexie";
import { configureSyncUser } from "@/lib/sync/sync-context";

const E2E_USER_ID = "e2e-user";

export function E2EClient() {
  const db = useSyncExternalStore(subscribeToDatabaseChanges, getCurrentDatabase, () => null);
  const [outboxCount, setOutboxCount] = useState(0);
  const [tripId, setTripId] = useState<string | null>(null);

  useEffect(() => {
    const instance = getDatabase(E2E_USER_ID);
    setCurrentDatabase(instance);
    configureSyncUser(E2E_USER_ID);

    return () => {
      setCurrentDatabase(null);
      configureSyncUser(null);
      void closeDatabase(E2E_USER_ID).catch(() => {});
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
    const trip = await tripRepository.create({ id: crypto.randomUUID(), ownerId: E2E_USER_ID, name: "E2E Test Trip" });
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

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">E2E harness</h1>
      <div className="mt-4 flex flex-col gap-3">
        <Button onClick={createTrip} disabled={!db}>Create trip</Button>
        <Button onClick={createActivity} disabled={!db || !tripId}>Create activity</Button>
      </div>
      <p className="mt-4" data-testid="trip-id">Trip: {tripId ?? "none"}</p>
      <p className="mt-2" data-testid="outbox-count">Outbox: {outboxCount}</p>
    </main>
  );
}
