import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deleteDatabase, getDatabase, setCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { configureSyncUser } from "@/lib/sync/sync-context";
import { tripRepository } from "@/features/trips/data/dexie-trip-repository";
import { DexieStepRepository } from "@/features/steps/data/dexie-step-repository";

const TEST_USER = "steps-test-user";
let db: ViatikDatabase;

beforeEach(async () => {
  await deleteDatabase(TEST_USER);
  db = getDatabase(TEST_USER);
  setCurrentDatabase(db);
  configureSyncUser(TEST_USER);
  await db.open();
  await tripRepository.create({
    id: "trip-1",
    ownerId: TEST_USER,
    name: "Test trip",
    startDate: "2026-09-20",
    endDate: "2026-09-24",
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DexieStepRepository", () => {
  it("upserts and lists daily steps for the current user and trip", async () => {
    const repository = new DexieStepRepository();
    const saved = await repository.upsert({
      userId: TEST_USER,
      tripId: "trip-1",
      dayDate: "2026-09-22",
      steps: 6420,
    });

    expect(saved.steps).toBe(6420);
    expect(saved.source).toBe("automatic");
    expect(await repository.listByTrip(TEST_USER, "trip-1")).toEqual([saved]);

    await db.trips.update("trip-1", { status: "active", startedAt: "2026-09-22T10:00:00.000Z" });
    const incremented = await repository.increment({
      userId: TEST_USER,
      tripId: "trip-1",
      dayDate: "2026-09-22",
      steps: 3,
    });
    expect(incremented.steps).toBe(6423);

    const updated = await repository.upsert({
      userId: TEST_USER,
      tripId: "trip-1",
      dayDate: "2026-09-22",
      steps: 7000,
    });
    expect(updated.id).toBe(saved.id);
    expect(await repository.listByTrip(TEST_USER, "trip-1")).toHaveLength(1);
    expect((await repository.listByTrip(TEST_USER, "trip-1"))[0].steps).toBe(7000);
  });

  it("rejects invalid counts and dates", async () => {
    const repository = new DexieStepRepository();
    await expect(repository.upsert({ userId: TEST_USER, tripId: "trip-1", dayDate: "2026-09-22", steps: -1 })).rejects.toThrow();
    await expect(repository.upsert({ userId: TEST_USER, tripId: "trip-1", dayDate: "2026-09-22", steps: 1.5 })).rejects.toThrow();
    await expect(repository.upsert({ userId: TEST_USER, tripId: "trip-1", dayDate: "2026-09-22", steps: 10 })).resolves.toBeTruthy();
    await expect(repository.upsert({ userId: TEST_USER, tripId: "trip-1", dayDate: "not-a-day", steps: 10 })).rejects.toThrow();
    await expect(repository.upsert({ userId: TEST_USER, tripId: "trip-1", dayDate: "2026-09-25", steps: 10 })).rejects.toThrow("within the trip dates");
  });
});
