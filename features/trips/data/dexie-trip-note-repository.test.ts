import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";

import { tripNoteRepository } from "@/features/trips/data/dexie-trip-note-repository";
import { deleteDatabase, getDatabase, setCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";

const TEST_USER = "trip-notes-user";
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
});
