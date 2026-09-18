import type { Activity, ActivityPollOption, ActivityPollVote } from "@/features/domain/entities";

export type VotingResolution =
  | { status: "approved"; option: ActivityPollOption | null }
  | { status: "rejected"; option: null }
  | { status: "tie_breaker_needed"; option: null };

export function resolveActivityVote(activity: Pick<Activity, "pollOptions" | "pollVotes">, eligibleUserCount: number): VotingResolution | null {
  const options = activity.pollOptions ?? [];
  const votes = activity.pollVotes ?? [];
  if (eligibleUserCount < 2 || new Set(votes.map((vote) => vote.userId)).size < eligibleUserCount) return null;

  const counts = new Map<string, number>();
  for (const vote of votes) {
    if (vote.choice === "decline") continue;
    if (vote.optionId) counts.set(vote.optionId, (counts.get(vote.optionId) ?? 0) + 1);
  }
  const max = Math.max(0, ...counts.values());
  const winners = options.filter((option) => (counts.get(option.id) ?? 0) === max);
  if (winners.length > 1 || (winners.length === 1 && max === 0)) return { status: "tie_breaker_needed", option: null };
  if (winners.length === 0) return { status: "rejected", option: null };
  return { status: "approved", option: winners[0] };
}

export function eligibleVoteCount(members: ReadonlyArray<{ viatikId?: string | null }>): number {
  return members.filter((member) => member.viatikId != null).length;
}

export function totalVotesCast(votes: ActivityPollVote[]): number {
  return new Set(votes.map((vote) => vote.userId)).size;
}
