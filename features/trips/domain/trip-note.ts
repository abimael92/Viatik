/** A short shared note on an active trip. Dexie is the source of truth. */
export interface TripNote {
  id: string;
  tripId: string;
  /** Author. Stays the same when another member edits the text. */
  userId: string;
  /** May be empty when the note has a voice clip. */
  content: string;
  /** Voice clip in tripMedia (kind "audio"). Set at creation and never changed. */
  audioMediaId: string | null;
  createdBy: string;
  updatedBy: string;
  deletedBy: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export const TRIP_NOTE_MAX_LENGTH = 280;
