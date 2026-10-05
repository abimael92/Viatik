import { liveQuery } from "dexie";

import type { TripMedia } from "@/features/domain/entities-media";
import { buildAudioMedia, mediaPayload } from "@/features/media/data/dexie-media-repository";
import { TRIP_NOTE_MAX_LENGTH, type TripNote } from "@/features/trips/domain/trip-note";
import { getCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { TransactionContext } from "@/lib/db/transaction-context";
import { append, type OutboxAppendData } from "@/lib/sync/outbox-transactional";

function getDb(): ViatikDatabase {
  const db = getCurrentDatabase();
  if (!db) throw new Error("No database is open. Wrap calls in DatabaseProvider.");
  return db;
}

function cleanContent(content: string, options: { allowEmpty?: boolean } = {}): string {
  const value = content.trim();
  if (!value && !options.allowEmpty) throw new Error("errors.noteRequired");
  if (value.length > TRIP_NOTE_MAX_LENGTH) throw new Error("errors.noteTooLong");
  return value;
}

export interface NewVoiceNote {
  id: string;
  tripId: string;
  userId: string;
  /** Optional caption typed before recording. */
  content?: string;
  audio: { mediaId: string; blob: Blob; contentType: string; durationMs: number };
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
      const note = newNote(input, content, null, now);
      await tx.table<TripNote>("tripNotes").add(note);
      await append("tripNote", "insert", note, { tx, baseUpdatedAt: null });
      return note;
    });
  }

  /**
   * Stores the clip and the note in one transaction. Only the note is queued;
   * the clip uploads through the media pipeline and the note waits for it.
   */
  async createVoiceNote(input: NewVoiceNote): Promise<TripNote> {
    const content = cleanContent(input.content ?? "", { allowEmpty: true });
    const db = getDb();
    const note = await TransactionContext.runInTransaction([db.tripNotes, db.tripMedia], async (tx) => {
      const now = new Date().toISOString();
      const media = buildAudioMedia({
        id: input.audio.mediaId,
        tripId: input.tripId,
        createdBy: input.userId,
        blob: input.audio.blob,
        contentType: input.audio.contentType,
        durationMs: input.audio.durationMs,
        now,
      });
      const created = newNote(input, content, media.id, now);
      await tx.table<TripMedia>("tripMedia").add(media);
      await tx.table<TripNote>("tripNotes").add(created);
      await append("tripNote", "insert", created, { tx, baseUpdatedAt: null });
      return created;
    });
    if (typeof window !== "undefined") window.dispatchEvent(new Event("viatik:sync-request"));
    return note;
  }

  async update(id: string, userId: string, content: string): Promise<TripNote> {
    const db = getDb();
    const existing = await db.tripNotes.get(id);
    if (!existing || existing.deletedAt) throw new Error("That note is no longer available.");
    const nextContent = cleanContent(content, { allowEmpty: Boolean(existing.audioMediaId) });
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
    await TransactionContext.runInTransaction([db.tripNotes, db.tripMedia], async (tx) => {
      const now = new Date().toISOString();
      const note: TripNote = {
        ...existing,
        deletedAt: now,
        deletedBy: userId,
        updatedBy: userId,
        version: existing.version + 1,
        updatedAt: now,
      };
      await tx.table<TripNote>("tripNotes").put(note);
      await append("tripNote", "update", note, { tx, baseUpdatedAt: existing.updatedAt });

      const media = existing.audioMediaId ? await tx.table<TripMedia>("tripMedia").get(existing.audioMediaId) : undefined;
      if (!media || media.deletedAt || media.createdBy !== userId) return;
      const deleted: TripMedia = { ...media, deletedAt: now, deletedBy: userId, updatedBy: userId, updatedAt: now };
      await tx.table<TripMedia>("tripMedia").put(deleted);
      if (media.uploadStatus === "uploaded") {
        await append("media", "update", mediaPayload(deleted) as OutboxAppendData, { tx, baseUpdatedAt: media.updatedAt });
      }
    });
  }
}

function newNote(
  input: { id: string; tripId: string; userId: string },
  content: string,
  audioMediaId: string | null,
  now: string
): TripNote {
  return {
    id: input.id,
    tripId: input.tripId,
    userId: input.userId,
    content,
    audioMediaId,
    createdBy: input.userId,
    updatedBy: input.userId,
    deletedBy: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

export const tripNoteRepository = new DexieTripNoteRepository();
