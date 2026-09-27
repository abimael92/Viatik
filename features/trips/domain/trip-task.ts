export type TripTaskStatus = "open" | "resolved";

/** A shared research or coordination task. Dexie is the source of truth. */
export interface TripTask {
  id: string;
  tripId: string;
  creatorId: string;
  assigneeId: string | null;
  title: string;
  description: string | null;
  resolutionText: string | null;
  status: TripTaskStatus;
  /** Storage paths from the existing trip media upload. */
  attachments: string[];
  createdBy: string;
  updatedBy: string;
  deletedBy: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export const TRIP_TASK_TITLE_MAX = 120;
