import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { collaborationRepository } from "@/features/collaboration/data/dexie-collaboration-repository";
import { deleteDatabase, getDatabase, setCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { configureSyncUser } from "@/lib/sync/sync-context";

const TEST_USER = "test-collaboration-user";

let db: ViatikDatabase;

beforeEach(async () => {
  await deleteDatabase(TEST_USER);
  db = getDatabase(TEST_USER);
  setCurrentDatabase(db);
  configureSyncUser(TEST_USER);
  await db.open();
  await db.trips.put({
    id: "trip-1",
    ownerId: TEST_USER,
    name: "Lisbon",
    description: null,
    destination: null,
    latitude: null,
    longitude: null,
    placeId: null,
    timeZone: null,
    startDate: null,
    endDate: null,
    status: "planned",
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    coverImageUrl: null,
    adultCount: 1,
    childCount: 0,
    baseCurrency: "USD",
    createdBy: TEST_USER,
    updatedBy: TEST_USER,
    deletedBy: null,
    restoredAt: null,
    restoredBy: null,
    statusChangedAt: "2026-01-01T00:00:00.000Z",
    statusChangedBy: TEST_USER,
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
  });
});

afterEach(async () => {
  db.close();
  await deleteDatabase(TEST_USER);
});

describe("direct trip member add", () => {
  it("queues a trip_added notification carrying the trip name", async () => {
    await collaborationRepository.setMemberRoleByUser("trip-1", "user-2", "editor", TEST_USER);

    const notifications = await db.notifications.toArray();
    expect(notifications).toEqual([
      expect.objectContaining({
        userId: "user-2",
        type: "trip_added",
        referenceId: "trip-1",
        message: "Lisbon",
      }),
    ]);
    const mutations = await db.outboxMutations.toArray();
    expect(mutations.map((mutation) => mutation.entityType).sort()).toEqual(["notification", "tripMember"]);
  });

  it("does not notify again when the member already belongs to the trip", async () => {
    await collaborationRepository.setMemberRoleByUser("trip-1", "user-2", "editor", TEST_USER);
    await db.notifications.clear();
    await db.outboxMutations.clear();

    await collaborationRepository.setMemberRoleByUser("trip-1", "user-2", "viewer", TEST_USER);

    expect(await db.notifications.count()).toBe(0);
    expect(await db.outboxMutations.count()).toBe(1);
  });
});
