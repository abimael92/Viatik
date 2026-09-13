import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deleteDatabase, getDatabase, setCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { configureSyncUser } from "@/lib/sync/sync-context";
import type { Trip } from "@/features/domain/entities";
import { tripRepository } from "@/features/trips/data/dexie-trip-repository";

const TEST_USER = "trip-duration-test-user";

let db: ViatikDatabase;

async function resetDatabase(): Promise<void> {
  for (const table of [
    db.trips,
    db.tripMembers,
    db.activities,
    db.expenses,
    db.expenseShares,
    db.tripMedia,
    db.tripInvitations,
    db.expenseSettlements,
    db.tripTravelers,
    db.contacts,
    db.outboxMutations,
    db.syncMetadata,
    db.syncConflicts,
  ]) {
    await table.clear();
  }
}

beforeEach(async () => {
  await deleteDatabase(TEST_USER);
  db = getDatabase(TEST_USER);
  setCurrentDatabase(db);
  configureSyncUser(TEST_USER);
  await db.open();
  await resetDatabase();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DexieTripRepository trip duration limit", () => {
  it("creates a trip with exactly 60 days", async () => {
    const trip = await tripRepository.create({
      id: "trip-60",
      ownerId: TEST_USER,
      name: "60 Day Trip",
      startDate: "2026-01-01",
      endDate: "2026-03-01",
    });

    expect(trip.startDate).toBe("2026-01-01");
    expect(trip.endDate).toBe("2026-03-01");
    expect(await db.trips.get("trip-60")).toEqual(trip);
  });

  it("rejects creating a trip with 61 days", async () => {
    await expect(
      tripRepository.create({
        id: "trip-61",
        ownerId: TEST_USER,
        name: "61 Day Trip",
        startDate: "2026-01-01",
        endDate: "2026-03-02",
      })
    ).rejects.toThrow("Trips can be up to 60 days long.");

    expect(await db.trips.get("trip-61")).toBeUndefined();
  });

  it("rejects updating a trip beyond 60 days", async () => {
    const trip = await tripRepository.create({
      id: "trip-update",
      ownerId: TEST_USER,
      name: "Short Trip",
      startDate: "2026-01-01",
      endDate: "2026-01-05",
    });

    await expect(
      tripRepository.update(trip.id, { endDate: "2026-03-02" })
    ).rejects.toThrow("Trips can be up to 60 days long.");
  });

  it("allows updating a trip to exactly 60 days", async () => {
    const trip = await tripRepository.create({
      id: "trip-update-60",
      ownerId: TEST_USER,
      name: "Short Trip",
      startDate: "2026-01-01",
      endDate: "2026-01-05",
    });

    const updated = await tripRepository.update(trip.id, { endDate: "2026-03-01" });
    expect(updated.endDate).toBe("2026-03-01");
  });

  it("rejects creating a trip with inverted dates", async () => {
    await expect(
      tripRepository.create({
        id: "trip-inverted",
        ownerId: TEST_USER,
        name: "Inverted Trip",
        startDate: "2026-09-25",
        endDate: "2026-09-22",
        latitude: null,
        longitude: null,
        placeId: null,
        timeZone: null,
      })
    ).rejects.toThrow("End date must be on or after the start date.");
  });

  it("allows unrelated updates to legacy trips without revalidating dates", async () => {
    await db.trips.put({
      id: "trip-legacy",
      ownerId: TEST_USER,
      name: "Legacy Trip",
      description: null,
      destination: null,
      latitude: null,
      longitude: null,
      placeId: null,
      timeZone: null,
      startDate: "2026-01-01",
      endDate: "2026-05-01",
      status: "planned",
      startedAt: null,
      completedAt: null,
      coverImageUrl: null,
      adultCount: 1,
      childCount: 0,
      baseCurrency: "USD",
      createdBy: TEST_USER,
      updatedBy: TEST_USER,
      deletedBy: null,
      restoredAt: null,
      restoredBy: null,
      cancelledAt: null,
      statusChangedAt: new Date().toISOString(),
      statusChangedBy: TEST_USER,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const updated = await tripRepository.update("trip-legacy", { name: "Legacy Trip Updated" });
    expect(updated.name).toBe("Legacy Trip Updated");
  });
});

describe("DexieTripRepository lifecycle", () => {
  async function createPlanned(): Promise<Trip> {
    return tripRepository.create({
      id: crypto.randomUUID(),
      ownerId: TEST_USER,
      name: "Lifecycle Trip",
      startDate: "2026-09-01",
      endDate: "2026-09-10",
    });
  }

  it("creates trips as planned with no lifecycle timestamps", async () => {
    const trip = await createPlanned();
    expect(trip.status).toBe("planned");
    expect(trip.startedAt).toBeNull();
    expect(trip.completedAt).toBeNull();
  });

  it("startTrip sets status active and stamps startedAt", async () => {
    const trip = await createPlanned();
    const started = await tripRepository.startTrip(trip.id);

    expect(started.status).toBe("active");
    expect(started.startedAt).not.toBeNull();
    expect(started.completedAt).toBeNull();

    const stored = await db.trips.get(trip.id);
    expect(stored?.status).toBe("active");
    expect(stored?.startedAt).not.toBeNull();
  });

  it("endTrip sets status completed and stamps completedAt", async () => {
    const trip = await createPlanned();
    const ended = await tripRepository.endTrip(trip.id);

    expect(ended.status).toBe("completed");
    expect(ended.completedAt).not.toBeNull();

    const stored = await db.trips.get(trip.id);
    expect(stored?.status).toBe("completed");
    expect(stored?.completedAt).not.toBeNull();
  });

  it("cancelTrip sets status cancelled and stamps completedAt", async () => {
    const trip = await createPlanned();
    const cancelled = await tripRepository.cancelTrip(trip.id);

    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.completedAt).not.toBeNull();

    const stored = await db.trips.get(trip.id);
    expect(stored?.status).toBe("cancelled");
  });
});
