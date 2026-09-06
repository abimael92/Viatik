/**
 * Group Polls tally & conversion engine.
 *
 * These are pure, side-effect-free calculations: given a poll and its votes
 * they produce the live percentage breakdown, the winning option (handling
 * zero-vote and tie cases), and — once a winner exists — a `NewActivity`
 * payload ready to be persisted through the `ActivityRepository`.
 */

import type { NewActivity } from "@/features/domain/repositories/activity-repository";
import type { Poll, PollOption, PollVote } from "@/features/polls/domain/poll-types";

/** Vote count per option id (each `PollVote` row is one member's vote). */
export function countVotesByOption(votes: PollVote[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const vote of votes) {
    counts[vote.optionId] = (counts[vote.optionId] ?? 0) + 1;
  }
  return counts;
}

export interface OptionTally {
  option: PollOption;
  votes: number;
  /** Share of total votes, 0–100, rounded to whole percent. 0 when no votes. */
  percentage: number;
}

/** Full live tally for a poll. `options` follow the poll's display order. */
export interface PollTally {
  totalVotes: number;
  hasVotes: boolean;
  options: OptionTally[];
  /** Options sharing the highest vote count (empty when there are no votes). */
  leaders: PollOption[];
  /**
   * The single winning option, or `null` when there are no votes or when the
   * vote is split (a tie) — callers should surface `isTie` for that case.
   */
  winner: PollOption | null;
  isTie: boolean;
}

export function calculateTally(poll: Poll, votes: PollVote[]): PollTally {
  const counts = countVotesByOption(votes);
  const totalVotes = votes.length;
  const options = [...poll.options]
    .sort((a, b) => a.position - b.position)
    .map((option) => {
      const count = counts[option.id] ?? 0;
      return {
        option,
        votes: count,
        percentage: totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0,
      };
    });

  const maxVotes = totalVotes > 0 ? Math.max(...options.map((entry) => entry.votes)) : 0;
  const leaders = options
    .filter((entry) => entry.votes === maxVotes && maxVotes > 0)
    .map((entry) => entry.option);

  return {
    totalVotes,
    hasVotes: totalVotes > 0,
    options,
    leaders,
    winner: leaders.length === 1 ? leaders[0] : null,
    isTie: leaders.length > 1,
  };
}

/** Pick a default scheduling day: the poll's hint, else the first trip day. */
export function pickWinnerDay(poll: Poll, tripDays: string[]): string | null {
  if (poll.dayDate) return poll.dayDate;
  return tripDays[0] ?? null;
}

/** The engine's input for converting a winning option into an activity. */
export interface WinnerActivityInput {
  poll: Poll;
  winner: PollOption;
  /** Day the activity will be scheduled on (ISO `yyyy-mm-dd`). */
  dayDate: string;
  /** Fractional position within the day (see `lib/ordering.ts`). */
  position: number;
  /** The member performing the conversion. */
  userId: string;
}

/**
 * Convert a winning poll option into an itinerary activity. Pure — returns a
 * `NewActivity` ready to be persisted; no ids/timestamps are stamped here
 * beyond the caller-provided ones.
 */
export function buildActivityFromWinner(input: WinnerActivityInput): NewActivity {
  const { poll, winner, dayDate, position, userId } = input;
  return {
    id: crypto.randomUUID(),
    tripId: poll.tripId,
    dayDate,
    title: winner.label,
    description: poll.question ? `Won poll “${poll.question}”` : "Chosen by group vote",
    location: poll.location,
    category: poll.category ?? "general",
    position,
    createdBy: userId,
  };
}
