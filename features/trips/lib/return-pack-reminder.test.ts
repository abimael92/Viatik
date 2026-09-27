import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Trip } from "@/features/domain/entities";
import { deleteDatabase, getDatabase, setCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import {
  queueReturnPackReminder,
  returnPackReferenceId,
  tripIdFromNotificationReference,
} from "@/features/trips/lib/return-pack-reminder";

const TEST_USER = "return-pack-reminder-user";
const NOW = new Date("2026-09-27T18:00:00.000Z");

let db: ViatikDatabase;

function trip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    ownerId: TEST_USER,
    name: "Mexico",
    description: null,
    destination: "Mexico City",
    latitude: null,
    longitude: null,
    placeId: null,
    timeZone: "UTC",
    startDate: "2026-09-20",
    endDate: "2026-09-27",
    status: "active",
    startedAt: "2026-09-20T00:00:00.000Z",
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
    statusChangedAt: "2026-09-20T00:00:00.000Z",
    statusChangedBy: TEST_USER,
    version: 1,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-20T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(async () => {
  await deleteDatabase(TEST_USER);
  db = getDatabase(TEST_USER);
  setCurrentDatabase(db);
  await db.open();
});

afterEach(async () => {
  setCurrentDatabase(null);
  await db.close();
});

describe("queueReturnPackReminder", () => {
  it("queues one trip_alert with a return reference on the end date", async () => {
    const queued = await queueReturnPackReminder({
      userId: TEST_USER,
      trip: trip(),
      message: "Time to pack for home",
      now: NOW,
    });
    const again = await queueReturnPackReminder({
      userId: TEST_USER,
      trip: trip(),
      message: "Time to pack for home",
      now: NOW,
    });

    expect(queued).toBe(true);
    expect(again).toBe(false);
    const rows = await db.notifications.where("userId").equals(TEST_USER).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(expect.objectContaining({
      type: "trip_alert",
      referenceId: returnPackReferenceId(trip().id),
      message: "Time to pack for home",
    }));
    expect(rows[0]?.referenceId).not.toBe(trip().id);
    expect(tripIdFromNotificationReference(rows[0]!.referenceId)).toBe(trip().id);
  });

  it("does not queue before the end date or for a trip that is not active", async () => {
    expect(await queueReturnPackReminder({
      userId: TEST_USER,
      trip: trip({ endDate: "2026-09-28" }),
      message: "Time to pack for home",
      now: NOW,
    })).toBe(false);
    expect(await queueReturnPackReminder({
      userId: TEST_USER,
      trip: trip({ status: "completed" }),
      message: "Time to pack for home",
      now: NOW,
    })).toBe(false);
    expect(await db.notifications.count()).toBe(0);
  });
});
