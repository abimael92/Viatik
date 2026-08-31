/**
 * Trip media stored locally while offline. Compressed images are kept as
 * Blobs in IndexedDB; when online they are uploaded to Supabase Storage and
 * the `uploadedUrl` is set.
 */
export interface TripMedia {
  id: string;
  tripId: string;
  activityId: string | null;
  caption: string | null;
  /** The compressed image blob held in IndexedDB. */
  blob: Blob;
  /** Object URL generated on demand for rendering (not persisted). */
  objectUrl?: string;
  uploadedUrl: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
