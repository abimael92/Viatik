/** A short shared note on an active trip. Dexie is the source of truth. */
export interface TripNote {
  id: string;
  tripId: string;
  /** Author. Stays the same when another member edits the text. */
  userId: string;
  content: string;
  createdBy: string;
  updatedBy: string;
  deletedBy: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export const TRIP_NOTE_MAX_LENGTH = 280;
