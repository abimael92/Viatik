export interface StagedTripMedia {
  id: string;
  tripId: string;
  activityId: string | null;
  caption: string | null;
  takenAt: string | null;
  blob: Blob;
  contentType: string;
  byteSize: number;
  createdBy: string;
  createdAt: string;
}
