import type { Activity } from "@/features/domain/entities";

/** Storage-agnostic contract for reading/writing itinerary activities. */
export interface ActivityRepository {
  listByTrip(tripId: string): Promise<Activity[]>;
  /** Live query: invokes `onChange` with the current list whenever it changes. */
  watchByTrip(tripId: string, onChange: (activities: Activity[]) => void): () => void;
  create(input: NewActivity): Promise<Activity>;
  update(id: string, patch: Partial<Omit<Activity, "id" | "tripId">>): Promise<Activity>;
  /**
   * Move an activity to a new day and/or position (drag-and-drop). `position`
   * is a fractional sort key: pass the midpoint between the two neighboring
   * activities' positions (see `lib/ordering.ts`) to avoid rewriting siblings.
   */
  move(id: string, dayDate: string, position: number): Promise<Activity>;
  /** Soft delete — sets `deletedAt`, does not remove the row. */
  remove(id: string): Promise<void>;
  /** Restore a soft-deleted activity by clearing `deletedAt`. */
  restore(id: string): Promise<Activity>;
}

export interface NewActivity {
  id: string;
  tripId: string;
  dayDate: string;
  title: string;
  description?: string | null;
  location?: string | null;
  category?: string;
  startTime?: string | null;
  endTime?: string | null;
  position: number;
  createdBy: string;
}
