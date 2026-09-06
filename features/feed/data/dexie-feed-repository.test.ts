import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deleteDatabase, getDatabase, setCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { configureSyncUser } from "@/lib/sync/sync-context";
import { activityRepository } from "@/features/activities/data/dexie-activity-repository";
import { expenseRepository } from "@/features/expenses/data/dexie-expense-repository";
import { mediaRepository } from "@/features/media/data/dexie-media-repository";
import { feedRepository } from "@/features/feed/data/dexie-feed-repository";

const TEST_USER = "test-feed-user";

let db: ViatikDatabase;

beforeEach(async () => {
  await deleteDatabase(TEST_USER);
  db = getDatabase(TEST_USER);
  setCurrentDatabase(db);
  configureSyncUser(TEST_USER);
  await db.open();
  await db.outboxMutations.clear();
  await db.feedItems.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DexieFeedRepository", () => {
  it("logs and lists feed items newest-first", async () => {
    const now = new Date();
    await feedRepository.log({
      id: "f1",
      tripId: "trip-1",
      actorId: TEST_USER,
      verb: "uploaded_photo",
      entityType: "media",
      entityId: "m1",
      summary: "uploaded a photo",
      metadata: {},
      createdAt: now.toISOString(),
    });
    const older = new Date(now.getTime() - 1000).toISOString();
    await feedRepository.log({
      id: "f2",
      tripId: "trip-1",
      actorId: TEST_USER,
      verb: "added_activity",
      entityType: "activity",
      entityId: "a1",
      summary: "added an activity",
      metadata: {},
      createdAt: older,
    });

    const list = await feedRepository.listByTrip("trip-1");
    expect(list.map((item) => item.id)).toEqual(["f1", "f2"]);
  });

  it("is scoped by trip", async () => {
    await feedRepository.log({
      id: "f1",
      tripId: "trip-1",
      actorId: TEST_USER,
      verb: "added_activity",
      entityType: "activity",
      entityId: "a1",
      summary: "added an activity",
      metadata: {},
      createdAt: new Date().toISOString(),
    });
    expect(await feedRepository.listByTrip("trip-2")).toHaveLength(0);
  });
});

describe("event emission from repositories", () => {
  it("emits a feed entry when an activity is created, updated, and deleted", async () => {
    const activity = await activityRepository.create({
      id: "a1",
      tripId: "trip-1",
      dayDate: "2026-06-01",
      title: "Hiking",
      position: 1,
      createdBy: TEST_USER,
    });
    await activityRepository.update(activity.id, { title: "Trail hike" });
    await activityRepository.remove(activity.id);

    const verbs = (await feedRepository.listByTrip("trip-1")).map((item) => item.verb);
    expect(verbs).toEqual(["deleted_activity", "updated_activity", "added_activity"]);
  });

  it("emits a feed entry when an expense is created", async () => {
    await expenseRepository.create({
      id: "e1",
      tripId: "trip-1",
      description: "Lunch",
      amountMinor: 1250n,
      currency: "USD",
      paidBy: TEST_USER,
      splitType: "equal",
      createdBy: TEST_USER,
      shares: [],
    });

    const items = await feedRepository.listByTrip("trip-1");
    expect(items).toHaveLength(1);
    expect(items[0].verb).toBe("added_expense");
    expect(items[0].summary).toContain("Lunch");
  });

  it("emits a feed entry when a photo is uploaded and removed", async () => {
    const blob = new Blob(["x"], { type: "image/jpeg" });
    const media = await mediaRepository.create({
      id: "m1",
      tripId: "trip-1",
      blob,
      createdBy: TEST_USER,
    });
    await mediaRepository.remove(media.id);

    const verbs = (await feedRepository.listByTrip("trip-1")).map((item) => item.verb);
    expect(verbs).toEqual(["deleted_photo", "uploaded_photo"]);
  });

  it("emits a feed entry on a photo caption update", async () => {
    const blob = new Blob(["x"], { type: "image/jpeg" });
    const media = await mediaRepository.create({
      id: "m1",
      tripId: "trip-1",
      blob,
      createdBy: TEST_USER,
    });
    await mediaRepository.updateCaption(media.id, "Sunset over the bay");

    const verbs = (await feedRepository.listByTrip("trip-1")).map((item) => item.verb);
    expect(verbs).toEqual(["updated_photo", "uploaded_photo"]);
  });
});
