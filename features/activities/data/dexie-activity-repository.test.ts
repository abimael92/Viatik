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
    await db.tripMedia.clear();
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
    expect(activity).toMatchObject({ createdBy: TEST_USER, updatedBy: TEST_USER, deletedBy: null, version: 1 });

    await activityRepository.remove("activity-1");
    const deleted = await db.activities.get("activity-1");
    expect(deleted?.deletedAt).not.toBeNull();
    expect(deleted).toMatchObject({ deletedBy: TEST_USER, updatedBy: TEST_USER, version: 2 });
    expect(await activityRepository.listByTrip("trip-1")).toHaveLength(0);

    const restored = await activityRepository.restore("activity-1");
    expect(restored.deletedAt).toBeNull();
    expect(restored).toMatchObject({ deletedBy: null, restoredBy: TEST_USER, version: 3 });

    const list = await activityRepository.listByTrip("trip-1");
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("activity-1");
  });

  it("throws when restoring a missing activity", async () => {
    await expect(activityRepository.restore("missing-id")).rejects.toThrow("missing-id");
  });

  it("persists and updates an embedded checklist through the outbox path", async () => {
    const created = await activityRepository.create({
      id: "activity-checklist-1",
      tripId: "trip-1",
      dayDate: "2026-06-01",
      title: "Museum day",
      checklist: [
        { id: "item-1", title: "Buy tickets", completed: false, archived: false },
        { id: "item-2", title: "  ", completed: false, archived: false },
      ],
      position: 1,
      createdBy: TEST_USER,
    });

    expect(created.checklist).toEqual([{ id: "item-1", title: "Buy tickets", completed: false, archived: false }]);
    expect(await db.outboxMutations.count()).toBe(1);

    const updated = await activityRepository.update("activity-checklist-1", {
      checklist: [
        { id: "item-1", title: "Buy tickets", completed: true, archived: false },
        { id: "item-2", title: "Meet at entrance", completed: false, archived: false },
      ],
    });

    expect(updated.checklist).toEqual([
      { id: "item-1", title: "Buy tickets", completed: true, archived: false },
      { id: "item-2", title: "Meet at entrance", completed: false, archived: false },
    ]);
    const mutations = await db.outboxMutations.toArray();
    expect(mutations).toHaveLength(1);
    expect(mutations[0]?.payload).toMatchObject({
      checklist: [
        { id: "item-1", title: "Buy tickets", completed: true, archived: false },
        { id: "item-2", title: "Meet at entrance", completed: false, archived: false },
      ],
    });
  });

  it("retains checklist items after the local database is closed and reopened", async () => {
    await activityRepository.create({
      id: "activity-checklist-reload",
      tripId: "trip-1",
      dayDate: "2026-06-01",
      title: "Museum day",
      checklist: [{ id: "item-1", title: "Buy tickets", completed: true, archived: false }],
      position: 1,
      createdBy: TEST_USER,
    });

    db.close();
    await db.open();
    setCurrentDatabase(db);

    expect((await activityRepository.listByTrip("trip-1"))[0]?.checklist).toEqual([
      { id: "item-1", title: "Buy tickets", completed: true, archived: false },
    ]);
  });

  it("updateChecklist atomically updates the parent activity and emits specific feed entries", async () => {
    await activityRepository.create({
      id: "activity-checklist-feed-1",
      tripId: "trip-1",
      dayDate: "2026-06-01",
      title: "compras",
      checklist: [{ id: "item-1", title: "Sacar efectivo", completed: false, archived: false }],
      position: 2,
      createdBy: TEST_USER,
    });

    const feedBefore = await db.feedItems.count();
    const completed = await activityRepository.updateChecklist(
      "activity-checklist-feed-1",
      [{ id: "item-1", title: "Sacar efectivo", completed: true, archived: false }],
      { action: "completed_checklist_item", itemTitle: "Sacar efectivo" },
    );

    expect(completed).toMatchObject({
      checklist: [{ id: "item-1", title: "Sacar efectivo", completed: true, archived: false }],
      updatedBy: TEST_USER,
      version: 2,
    });
    const feed = await db.feedItems.orderBy("createdAt").reverse().toArray();
    expect(feed.length).toBe(feedBefore + 1);
    expect(feed[0]).toMatchObject({
      verb: "completed_checklist_item",
      entityType: "activity",
      entityId: "activity-checklist-feed-1",
      summary: 'completed “Sacar efectivo” on “compras”',
    });

    const deleted = await activityRepository.updateChecklist(
      "activity-checklist-feed-1",
      [],
      { action: "deleted_checklist_item", itemTitle: "Sacar efectivo" },
    );
    expect(deleted).toMatchObject({ checklist: [], updatedBy: TEST_USER, version: 3 });
    expect((await db.feedItems.orderBy("createdAt").reverse().first())).toMatchObject({
      verb: "deleted_checklist_item",
      summary: 'deleted “Sacar efectivo” from “compras”',
    });
  });
});

describe("saveActivityPlanning", () => {
  it("writes activity, pending media, and outbox atomically and skips cancel leftovers", async () => {
    const { saveActivityPlanning } = await import("@/features/activities/data/save-activity-planning");
    const blob = new Blob(["photo"], { type: "image/jpeg" });

    const saved = await saveActivityPlanning({
      activity: {
        id: "activity-attach-1",
        tripId: "trip-1",
        dayDate: "2026-06-01",
        title: "Museum day",
        attachments: [{ id: "img-1", kind: "image", mediaId: "media-1", caption: "Tickets", altText: null }],
        position: 1,
        createdBy: TEST_USER,
      },
      pendingImages: [{ id: "media-1", blob, caption: "Tickets" }],
    });

    expect(saved.attachments).toEqual([
      { id: "img-1", kind: "image", mediaId: "media-1", caption: "Tickets", altText: null },
    ]);
    const media = await db.tripMedia.get("media-1");
    expect(media).toMatchObject({
      id: "media-1",
      activityId: "activity-attach-1",
      uploadStatus: "pending",
      blob,
    });
    expect(await db.outboxMutations.count()).toBe(1);
    const outbox = JSON.stringify(await db.outboxMutations.toArray());
    expect(outbox).toContain("media-1");
    expect(outbox).not.toContain("data:image");
    const { activityToRow } = await import("@/lib/supabase/mappers");
    expect(activityToRow(saved).attachments).toEqual(saved.attachments);

    db.close();
    await db.open();
    setCurrentDatabase(db);
    expect((await db.tripMedia.get("media-1"))?.blob).toBeTruthy();
    expect((await db.activities.get("activity-attach-1"))?.attachments).toHaveLength(1);
  });

  it("soft-deletes unreferenced attachment media on update", async () => {
    const { saveActivityPlanning } = await import("@/features/activities/data/save-activity-planning");
    const blob = new Blob(["photo"], { type: "image/jpeg" });
    const existing = await saveActivityPlanning({
      activity: {
        id: "activity-attach-2",
        tripId: "trip-1",
        dayDate: "2026-06-01",
        title: "Museum day",
        attachments: [{ id: "img-1", kind: "image", mediaId: "media-2", caption: null, altText: null }],
        position: 1,
        createdBy: TEST_USER,
      },
      pendingImages: [{ id: "media-2", blob, caption: null }],
    });

    const updated = await saveActivityPlanning({
      existing,
      activity: {
        id: existing.id,
        tripId: existing.tripId,
        dayDate: existing.dayDate,
        title: existing.title,
        attachments: [{
          id: "link-1",
          kind: "link",
          url: "https://example.com",
          title: "Menu",
          description: null,
          siteName: null,
          previewImageMediaId: null,
        }],
        position: existing.position,
        createdBy: TEST_USER,
      },
    });

    expect(updated.attachments?.[0]?.kind).toBe("link");
    expect((await db.tripMedia.get("media-2"))?.deletedAt).not.toBeNull();
  });
});
