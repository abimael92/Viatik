"use client";

import { useEffect, useState } from "react";

import { activityRepository } from "@/features/activities/data/dexie-activity-repository";
import { tripRepository } from "@/features/trips/data/dexie-trip-repository";
import { db } from "@/lib/db/dexie";
import { Button } from "@/components/ui/button";

export default function E2EPage() {
  const [outboxCount, setOutboxCount] = useState(0);
  const [tripId, setTripId] = useState<string | null>(null);

  async function refreshOutbox() {
    const count = await db.outboxMutations.count();
    setOutboxCount(count);
  }

  useEffect(() => {
    const initial = setTimeout(refreshOutbox, 0);
    const interval = setInterval(refreshOutbox, 500);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, []);

  async function createTrip() {
    const userId = crypto.randomUUID();
    const trip = await tripRepository.create({
      id: crypto.randomUUID(),
      ownerId: userId,
      name: "E2E Test Trip",
    });
    setTripId(trip.id);
    await refreshOutbox();
  }

  async function createActivity() {
    const id = tripId ?? "unknown";
    await activityRepository.create({
      id: crypto.randomUUID(),
      tripId: id,
      dayDate: "2025-01-01",
      title: "Offline activity",
      position: 1024,
      createdBy: crypto.randomUUID(),
    });
    await refreshOutbox();
  }

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">E2E harness</h1>
      <div className="mt-4 flex flex-col gap-3">
        <Button onClick={createTrip}>Create trip</Button>
        <Button onClick={createActivity} disabled={!tripId}>
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
