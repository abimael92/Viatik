/**
 * Trip media stored locally while offline. Compressed images are kept as
 * Blobs in IndexedDB; when online they are uploaded to Supabase Storage and
 * the `uploadedUrl` is set.
 */
export type MediaUploadStatus = "pending" | "uploading" | "uploaded" | "failed";

export interface TripMedia {
  id: string;
  tripId: string;
  activityId: string | null;
  caption: string | null;
  /** The compressed image blob held in IndexedDB. */
  blob: Blob | null;
  /** Object URL generated on demand for rendering (not persisted). */
  objectUrl?: string;
  storagePath: string;
  uploadedUrl: string | null;
  signedUrlExpiresAt: string | null;
  contentType: string;
  byteSize: number;
  createdBy: string;
  uploadStatus: MediaUploadStatus;
  uploadProgress: number;
  uploadError: string | null;
  uploadAttempts: number;
  nextUploadAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
