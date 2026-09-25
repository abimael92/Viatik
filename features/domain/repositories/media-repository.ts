import type { TripMedia } from "@/features/domain/entities-media";

export interface NewTripMedia {
  id: string;
  tripId: string;
  activityId?: string | null;
  caption?: string | null;
  /** Capture date (`yyyy-mm-dd`) read from EXIF or the file's lastModified time. */
  takenAt?: string | null;
  blob: Blob;
  createdBy: string;
}

export interface MediaRepository {
  listByTrip(tripId: string, activityId?: string | null): Promise<TripMedia[]>;
  watchByTrip(tripId: string, activityId: string | null, onChange: (media: TripMedia[]) => void): () => void;
  watchByIds(ids: string[], onChange: (media: TripMedia[]) => void): () => void;
  create(input: NewTripMedia): Promise<TripMedia>;
  updateCaption(id: string, caption: string | null): Promise<void>;
  remove(id: string): Promise<void>;
  retry(id: string): Promise<void>;
}
