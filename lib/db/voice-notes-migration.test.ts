import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";

import { ViatikDatabase } from "@/lib/db/dexie";

const databaseNames: string[] = [];

afterEach(async () => {
  for (const name of databaseNames.splice(0)) await Dexie.delete(name);
});

describe("voice notes migrations", () => {
  it("adds a pull-only media transcript store keyed by mediaId in v44", async () => {
    const name = `media-transcripts-${crypto.randomUUID()}`;
    databaseNames.push(name);
    const db = new ViatikDatabase(name);

    try {
      await db.open();
      expect(db.verno).toBe(44);
      expect(db.mediaTranscripts.schema.primKey.name).toBe("mediaId");
      expect(db.mediaTranscripts.schema.indexes.map((index) => index.name)).toEqual(expect.arrayContaining(["tripId", "status", "updatedAt"]));
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
});
