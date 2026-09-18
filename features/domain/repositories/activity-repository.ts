import type { Activity, ActivityParticipant, ActivityPollOption, ActivityPollStatus, ActivityPollVote } from "@/features/domain/entities";
import type { MinorUnits } from "@/features/domain/money";

/** Storage-agnostic contract for reading/writing itinerary activities. */
export interface ActivityRepository {
  listByTrip(tripId: string): Promise<Activity[]>;
  /** Live query: invokes `onChange` with the current list whenever it changes. */
  watchByTrip(tripId: string, onChange: (activities: Activity[]) => void): () => void;
  create(input: NewActivity): Promise<Activity>;
  update(id: string, patch: Partial<Omit<Activity, "id" | "tripId">>): Promise<Activity>;
  /** Cancel an activity proposal; only its creator may perform this transition. */
  cancelProposal(id: string): Promise<Activity>;
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
  placeName?: string | null;
  formattedAddress?: string | null;
  placeId?: string | null;
  /** @deprecated Use structured place fields. */
  location?: string | null;
  /** @deprecated Use `placeId`. */
  latitude?: number | null;
  /** @deprecated Use `placeId`. */
  longitude?: number | null;
  category?: string;
  timingSpecificity?: "exact" | "flexible";
  flexiblePeriod?: "morning" | "afternoon" | "evening" | "anytime" | null;
  startTime?: string | null;
  endTime?: string | null;
  bookingReference?: string | null;
  participants?: ActivityParticipant[];
  pollStatus?: ActivityPollStatus;
  votingEndsAt?: string | null;
  pollOptions?: ActivityPollOption[];
  pollVotes?: ActivityPollVote[];
  position: number;
  estimatedCostMinor?: MinorUnits | null;
  createdBy: string;
}
