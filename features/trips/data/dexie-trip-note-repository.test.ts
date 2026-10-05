import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";

import { mediaRepository } from "@/features/media/data/dexie-media-repository";
import { tripNoteRepository } from "@/features/trips/data/dexie-trip-note-repository";
import { deleteDatabase, getDatabase, setCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";

const TEST_USER = "trip-notes-user";
const NOTE_ID = "11111111-1111-4111-8111-111111111111";
const TRIP_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const MEDIA_ID = "66666666-6666-4666-8666-666666666666";
let db: ViatikDatabase;

beforeEach(async () => {
  await deleteDatabase(TEST_USER);
  db = getDatabase(TEST_USER);
  setCurrentDatabase(db);
  await db.open();
});

describe("trip note repository", () => {
  it("stores a note locally and queues an insert", async () => {
    const note = await tripNoteRepository.create({
      id: "11111111-1111-4111-8111-111111111111",
      tripId: "22222222-2222-4222-8222-222222222222",
      userId: "33333333-3333-4333-8333-333333333333",
      content: "  Happy hour at 8 PM  ",
    });

    expect(note.content).toBe("Happy hour at 8 PM");
    expect(await db.tripNotes.get(note.id)).toMatchObject({ content: "Happy hour at 8 PM" });
    const queued = await db.outboxMutations.toArray();
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      entityType: "tripNote",
      operation: "insert",
      entityId: note.id,
    });
  });

  it("stores a voice note's audio and note together and queues only the note", async () => {
    const blob = new Blob(["voice"], { type: "audio/webm" });
    const note = await tripNoteRepository.createVoiceNote({
      id: NOTE_ID,
      tripId: TRIP_ID,
      userId: USER_ID,
      content: "",
      audio: { mediaId: MEDIA_ID, blob, contentType: "audio/webm", durationMs: 4200 },
    });

    expect(note).toMatchObject({ content: "", audioMediaId: MEDIA_ID });
    expect(await db.tripMedia.get(MEDIA_ID)).toMatchObject({
      kind: "audio",
      durationMs: 4200,
      contentType: "audio/webm",
      storagePath: `${TRIP_ID}/audio/${MEDIA_ID}.webm`,
      uploadStatus: "pending",
      activityId: null,
      createdBy: USER_ID,
    });
    expect((await db.tripMedia.get(MEDIA_ID))?.blob).toBeTruthy();
    const queued = await db.outboxMutations.toArray();
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ entityType: "tripNote", operation: "insert", entityId: NOTE_ID });
    expect(JSON.stringify(queued[0].payload)).not.toContain("blob");
    expect(Object.values(queued[0].payload ?? {}).some((value) => value instanceof Blob)).toBe(false);
    expect(await db.feedItems.count()).toBe(0);
  });

  it("keeps a voice note caption within the note limit", async () => {
    await expect(tripNoteRepository.createVoiceNote({
      id: NOTE_ID,
      tripId: TRIP_ID,
      userId: USER_ID,
      content: "a".repeat(281),
      audio: { mediaId: MEDIA_ID, blob: new Blob(["voice"], { type: "audio/webm" }), contentType: "audio/webm", durationMs: 1000 },
    })).rejects.toThrow("errors.noteTooLong");
    expect(await db.tripMedia.count()).toBe(0);
  });

  it("allows clearing a voice note's caption but not a text note's content", async () => {
    await tripNoteRepository.createVoiceNote({
      id: NOTE_ID,
      tripId: TRIP_ID,
      userId: USER_ID,
      content: "Market",
      audio: { mediaId: MEDIA_ID, blob: new Blob(["voice"], { type: "audio/webm" }), contentType: "audio/webm", durationMs: 1000 },
    });
    await expect(tripNoteRepository.update(NOTE_ID, USER_ID, "  ")).resolves.toMatchObject({ content: "" });

    const textNote = await tripNoteRepository.create({ id: "44444444-4444-4444-8444-444444444444", tripId: TRIP_ID, userId: USER_ID, content: "Dinner" });
    await expect(tripNoteRepository.update(textNote.id, USER_ID, " ")).rejects.toThrow("errors.noteRequired");
  });

  it("deletes an unsynced voice note's audio locally without queueing a media mutation", async () => {
    await tripNoteRepository.createVoiceNote({
      id: NOTE_ID,
      tripId: TRIP_ID,
      userId: USER_ID,
      content: "",
      audio: { mediaId: MEDIA_ID, blob: new Blob(["voice"], { type: "audio/webm" }), contentType: "audio/webm", durationMs: 1000 },
    });

    await tripNoteRepository.remove(NOTE_ID, USER_ID);

    expect((await db.tripMedia.get(MEDIA_ID))?.deletedAt).not.toBeNull();
    expect((await db.tripNotes.get(NOTE_ID))?.deletedAt).not.toBeNull();
    expect((await db.outboxMutations.toArray()).map((mutation) => mutation.entityType)).toEqual(["tripNote"]);
  });

  it("propagates the audio deletion once the clip was uploaded", async () => {
    await tripNoteRepository.createVoiceNote({
      id: NOTE_ID,
      tripId: TRIP_ID,
      userId: USER_ID,
      content: "",
      audio: { mediaId: MEDIA_ID, blob: new Blob(["voice"], { type: "audio/webm" }), contentType: "audio/webm", durationMs: 1000 },
    });
    await db.tripMedia.update(MEDIA_ID, { uploadStatus: "uploaded" });

    await tripNoteRepository.remove(NOTE_ID, USER_ID);

    const mediaMutation = (await db.outboxMutations.toArray()).find((mutation) => mutation.entityType === "media");
    expect(mediaMutation).toMatchObject({ operation: "update", entityId: MEDIA_ID });
    expect(mediaMutation?.payload).toMatchObject({ kind: "audio", deletedAt: expect.any(String) });
  });

  it("keeps audio out of the photo lists", async () => {
    await tripNoteRepository.createVoiceNote({
      id: NOTE_ID,
      tripId: TRIP_ID,
      userId: USER_ID,
      content: "",
      audio: { mediaId: MEDIA_ID, blob: new Blob(["voice"], { type: "audio/webm" }), contentType: "audio/webm", durationMs: 1000 },
    });
    await mediaRepository.create({ id: "55555555-5555-4555-8555-555555555555", tripId: TRIP_ID, blob: new Blob(["photo"], { type: "image/jpeg" }), createdBy: USER_ID });

    const photos = await mediaRepository.listByTrip(TRIP_ID, null);

    expect(photos.map((media) => media.id)).toEqual(["55555555-5555-4555-8555-555555555555"]);
    expect(photos[0]).toMatchObject({ kind: "photo", durationMs: null });
  });
});
