/**
 * Trip media stored locally while offline. Compressed images are kept as
 * Blobs in IndexedDB; when online they are uploaded to Supabase Storage and
 * the `uploadedUrl` is set.
 */
export type MediaUploadStatus = "pending" | "uploading" | "uploaded" | "failed";

/** Photos appear in galleries; audio clips belong to voice notes only. */
export type MediaKind = "photo" | "audio";

export interface TripMedia {
  id: string;
  tripId: string;
  activityId: string | null;
  kind: MediaKind;
  /** Clip length for audio; null for photos. */
  durationMs: number | null;
  caption: string | null;
  /**
   * Capture date of the photo (ISO date `yyyy-mm-dd`), read from EXIF
   * DateTimeOriginal or falling back to the file's lastModified date. Used to
   * group/filter the gallery by the day the photo was taken.
   */
  takenAt?: string | null;
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
  updatedBy: string;
  deletedBy: string | null;
  restoredAt: string | null;
  restoredBy: string | null;
  version: number;
  uploadStatus: MediaUploadStatus;
  uploadProgress: number;
  uploadError: string | null;
  uploadAttempts: number;
  nextUploadAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export type MediaTranscriptStatus = "pending" | "processing" | "done" | "failed" | "skipped";

/** Read-only server transcript of a voice-note clip (audio-notes spec, Phase 3). */
export interface MediaTranscript {
  mediaId: string;
  tripId: string;
  status: MediaTranscriptStatus;
  text: string | null;
  /** Detected language code, e.g. `es`. */
  language: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}
