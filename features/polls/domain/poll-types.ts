/**
 * Group Polls & Real-Time Voting domain entities. These are plain TypeScript
 * shapes with no dependency on Dexie or Supabase row types.
 *
 * Crew polls are shared decisions. They are saved on the device first, then
 * queued so every traveler on the trip can see and vote.
 */

export type PollStatus = "active" | "closed";

/** A single selectable choice on a poll. */
export interface PollOption {
  id: string;
  pollId: string;
  label: string;
  /** Display order within the poll. */
  position: number;
  createdAt: string; // ISO datetime
}

/**
 * A group decision question posed to the trip's members. While `active`,
 * members can cast or change a vote; once `closed` the tally is frozen and a
 * winner can be auto-scheduled into the itinerary.
 *
 * Options are embedded on the poll (there is no separate `pollOptions` table):
 * the option set is fixed at creation time, so it lives as a small array
 * alongside the question rather than as its own indexed store.
 */
/** @deprecated Use the synchronized Decision entity instead. */
export interface Poll {
  id: string;
  tripId: string;
  question: string;
  /** The poll's selectable choices, in `position` order. */
  options: PollOption[];
  /** Which member created the poll. */
  createdBy: string;
  status: PollStatus;
  /** Optional day hint (ISO `yyyy-mm-dd`) used when auto-scheduling the winner. */
  dayDate: string | null;
  /** Optional location hint carried onto the generated activity. */
  location: string | null;
  /** Optional category hint carried onto the generated activity. */
  category: string | null;
  /** Set once the winning option has been converted into an itinerary activity. */
  scheduledActivityId: string | null;
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
  deletedAt: string | null;
}

/**
 * A single member's vote. One vote per user per poll: casting again replaces
 * the previous vote (only while the poll is active). Indexed by `pollId` (and
 * `[pollId+userId]` for the uniqueness guarantee).
 */
/** @deprecated Use DecisionVote from the unified voting model instead. */
export interface PollVote {
  id: string;
  pollId: string;
  optionId: string;
  userId: string;
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
}

/** Input used to create a poll. Options are minted inside the repository. */
export interface NewPoll {
  tripId: string;
  question: string;
  options: string[];
  createdBy: string;
  dayDate?: string | null;
  location?: string | null;
  category?: string | null;
}

/** Storage-agnostic contract for reading/writing polls and votes. */
export interface PollRepository {
  listByTrip(tripId: string): Promise<Poll[]>;
  /** Live query: invokes `onChange` whenever the trip's polls change. */
  watchByTrip(tripId: string, onChange: (polls: Poll[]) => void): () => void;
  listVotesByPoll(pollId: string): Promise<PollVote[]>;
  /** Live query: invokes `onChange` whenever a poll's votes change. */
  watchVotesByPoll(pollId: string, onChange: (votes: PollVote[]) => void): () => void;
  create(input: NewPoll): Promise<Poll>;
  /** Cast (or change) the current user's vote. Throws if the poll is closed. */
  castVote(pollId: string, optionId: string, userId: string): Promise<PollVote>;
  /** Freeze a poll so no further votes are accepted. */
  close(id: string): Promise<Poll>;
  /** Record the itinerary activity created from this poll's winning option. */
  markScheduled(id: string, activityId: string): Promise<Poll>;
}
