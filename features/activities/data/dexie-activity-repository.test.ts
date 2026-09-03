import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deleteDatabase, getDatabase, setCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { configureSyncUser } from "@/lib/sync/sync-context";
import { activityRepository } from "@/features/activities/data/dexie-activity-repository";

const TEST_USER = "test-activity-user";

let db: ViatikDatabase;

beforeEach(async () => {
  await deleteDatabase(TEST_USER);
  db = getDatabase(TEST_USER);
  setCurrentDatabase(db);
  configureSyncUser(TEST_USER);
  await db.open();
  await db.activities.clear();
  await db.outboxMutations.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DexieActivityRepository", () => {
  it("creates, deletes, and restores an activity", async () => {
    const activity = await activityRepository.create({
      id: "activity-1",
      tripId: "trip-1",
      dayDate: "2026-06-01",
      title: "Hiking",
      position: 1,
      createdBy: TEST_USER,
    });

    expect(await db.activities.get("activity-1")).toEqual(activity);

    await activityRepository.remove("activity-1");
    const deleted = await db.activities.get("activity-1");
    expect(deleted?.deletedAt).not.toBeNull();
    expect(await activityRepository.listByTrip("trip-1")).toHaveLength(0);

    const restored = await activityRepository.restore("activity-1");
    expect(restored.deletedAt).toBeNull();

    const list = await activityRepository.listByTrip("trip-1");
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("activity-1");
  });

  it("throws when restoring a missing activity", async () => {
    await expect(activityRepository.restore("missing-id")).rejects.toThrow("missing-id");
  });
});
