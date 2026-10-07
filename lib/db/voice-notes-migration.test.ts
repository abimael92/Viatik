import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";

import { ViatikDatabase } from "@/lib/db/dexie";

const databaseNames: string[] = [];

afterEach(async () => {
  for (const name of databaseNames.splice(0)) await Dexie.delete(name);
});

describe("voice notes migrations", () => {
  it("retains the transcript and staged draft stores in v46", async () => {
    const name = `media-transcripts-${crypto.randomUUID()}`;
    databaseNames.push(name);
    const db = new ViatikDatabase(name);

    try {
      await db.open();
      expect(db.verno).toBe(46);
      expect(db.mediaTranscripts.schema.primKey.name).toBe("mediaId");
      expect(db.mediaTranscripts.schema.indexes.map((index) => index.name)).toEqual(expect.arrayContaining(["tripId", "status", "updatedAt"]));
      expect(db.stagedTripMedia.schema.primKey.name).toBe("id");
      expect(db.stagedTripMedia.schema.indexes.map((index) => index.name)).toEqual(expect.arrayContaining(["tripId", "createdBy", "createdAt", "[tripId+createdAt]"]));
    } finally {
      db.close();
    }
  });

  it("backfills existing media as photos and existing notes without audio", async () => {
    const name = `voice-notes-${crypto.randomUUID()}`;
    databaseNames.push(name);
    const legacy = new Dexie(name);
    legacy.version(42).stores({
      tripMedia: "id, tripId, activityId, uploadStatus, takenAt, updatedAt, deletedAt",
      tripNotes: "id, tripId, userId, createdAt, updatedAt, deletedAt",
    });
    await legacy.open();
    await legacy.table("tripMedia").add({
      id: "media-1",
      tripId: "trip-1",
      activityId: null,
      storagePath: "trip-1/media-1.jpg",
      contentType: "image/jpeg",
      uploadStatus: "uploaded",
      updatedAt: "2026-09-01T00:00:00.000Z",
      deletedAt: null,
    });
    await legacy.table("tripNotes").add({
      id: "note-1",
      tripId: "trip-1",
      userId: "user-1",
      content: "Dinner at 8",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      deletedAt: null,
    });
    legacy.close();

    const db = new ViatikDatabase(name);
    try {
      await db.open();
      expect(await db.tripMedia.get("media-1")).toEqual(expect.objectContaining({ kind: "photo", durationMs: null }));
      expect(await db.tripNotes.get("note-1")).toEqual(expect.objectContaining({ audioMediaId: null, content: "Dinner at 8" }));
      expect(await db.tripMedia.where("kind").equals("photo").count()).toBe(1);
    } finally {
      db.close();
    }
  });

  it("backfills uploaded photos as legacy-public, pending photos as private, and preserves staged drafts", async () => {
    const name = `photo-visibility-${crypto.randomUUID()}`;
    databaseNames.push(name);
    const legacy = new Dexie(name);
    legacy.version(45).stores({
      tripMedia: "id, tripId, activityId, uploadStatus, takenAt, kind, updatedAt, deletedAt",
      stagedTripMedia: "id, tripId, createdBy, createdAt, [tripId+createdAt]",
    });
    await legacy.open();
    await legacy.table("tripMedia").bulkAdd([
      { id: "uploaded-photo", tripId: "trip-1", kind: "photo", uploadStatus: "uploaded", updatedAt: "2026-01-01", deletedAt: null },
      { id: "pending-photo", tripId: "trip-1", kind: "photo", uploadStatus: "pending", updatedAt: "2026-01-01", deletedAt: null },
      { id: "audio", tripId: "trip-1", kind: "audio", uploadStatus: "uploaded", updatedAt: "2026-01-01", deletedAt: null },
    ]);
    await legacy.table("stagedTripMedia").add({
      id: "draft-1", tripId: "trip-1", createdBy: "user-1", createdAt: "2026-01-01",
    });
    legacy.close();

    const db = new ViatikDatabase(name);
    try {
      await db.open();
      expect(await db.tripMedia.get("uploaded-photo")).toMatchObject({ publicGallery: true });
      expect(await db.tripMedia.get("pending-photo")).toMatchObject({ publicGallery: false });
      expect(await db.tripMedia.get("audio")).toMatchObject({ publicGallery: false });
      expect(await db.stagedTripMedia.get("draft-1")).toMatchObject({ id: "draft-1" });
    } finally {
      db.close();
    }
  });
});
