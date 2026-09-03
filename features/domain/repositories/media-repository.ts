import type { TripMedia } from "@/features/domain/entities-media";

export interface NewTripMedia {
  id: string;
  tripId: string;
  activityId?: string | null;
  caption?: string | null;
  blob: Blob;
  createdBy: string;
}

export interface MediaRepository {
  listByTrip(tripId: string, activityId?: string | null): Promise<TripMedia[]>;
  watchByTrip(tripId: string, activityId: string | null, onChange: (media: TripMedia[]) => void): () => void;
  create(input: NewTripMedia): Promise<TripMedia>;
  updateCaption(id: string, caption: string | null): Promise<void>;
  remove(id: string): Promise<void>;
  retry(id: string): Promise<void>;
}
