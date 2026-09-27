import { liveQuery } from "dexie";

import { TRIP_NOTE_MAX_LENGTH, type TripNote } from "@/features/trips/domain/trip-note";
import { getCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { TransactionContext } from "@/lib/db/transaction-context";
import { append } from "@/lib/sync/outbox-transactional";

function getDb(): ViatikDatabase {
  const db = getCurrentDatabase();
  if (!db) throw new Error("No database is open. Wrap calls in DatabaseProvider.");
  return db;
}

function cleanContent(content: string): string {
  const value = content.trim();
  if (!value) throw new Error("Write a note before saving.");
  if (value.length > TRIP_NOTE_MAX_LENGTH) throw new Error("Keep the note under 280 characters.");
  return value;
}

export class DexieTripNoteRepository {
  watchByTrip(tripId: string, onChange: (notes: TripNote[]) => void): () => void {
    const subscription = liveQuery(async () => {
      const notes = await getDb()
        .tripNotes.where("tripId")
        .equals(tripId)
        .filter((note) => note.deletedAt === null)
        .toArray();
      return notes.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    }).subscribe({ next: onChange, error: () => onChange([]) });
    return () => subscription.unsubscribe();
  }

  async create(input: { id: string; tripId: string; userId: string; content: string }): Promise<TripNote> {
    const content = cleanContent(input.content);
    const db = getDb();
    return TransactionContext.runInTransaction([db.tripNotes], async (tx) => {
      const now = new Date().toISOString();
      const note: TripNote = {
        id: input.id,
        tripId: input.tripId,
        userId: input.userId,
        content,
        createdBy: input.userId,
        updatedBy: input.userId,
        deletedBy: null,
        version: 1,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      await tx.table<TripNote>("tripNotes").add(note);
      await append("tripNote", "insert", note, { tx, baseUpdatedAt: null });
      return note;
    });
  }

  async update(id: string, userId: string, content: string): Promise<TripNote> {
    const nextContent = cleanContent(content);
    const db = getDb();
    const existing = await db.tripNotes.get(id);
    if (!existing || existing.deletedAt) throw new Error("That note is no longer available.");
    return TransactionContext.runInTransaction([db.tripNotes], async (tx) => {
      const note: TripNote = {
        ...existing,
        content: nextContent,
        updatedBy: userId,
        version: existing.version + 1,
        updatedAt: new Date().toISOString(),
      };
      await tx.table<TripNote>("tripNotes").put(note);
      await append("tripNote", "update", note, { tx, baseUpdatedAt: existing.updatedAt });
      return note;
    });
  }

  async remove(id: string, userId: string): Promise<void> {
    const db = getDb();
    const existing = await db.tripNotes.get(id);
    if (!existing || existing.deletedAt) return;
    await TransactionContext.runInTransaction([db.tripNotes], async (tx) => {
      const note: TripNote = {
        ...existing,
        deletedAt: new Date().toISOString(),
        deletedBy: userId,
        updatedBy: userId,
        version: existing.version + 1,
        updatedAt: new Date().toISOString(),
      };
      await tx.table<TripNote>("tripNotes").put(note);
      await append("tripNote", "update", note, { tx, baseUpdatedAt: existing.updatedAt });
    });
  }
}

export const tripNoteRepository = new DexieTripNoteRepository();
