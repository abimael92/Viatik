import { liveQuery } from "dexie";

import { getCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { logger } from "@/lib/observability/logger";
import type {
  NewPoll,
  Poll,
  PollOption,
  PollRepository,
  PollVote,
} from "@/features/polls/domain/poll-types";

function getDb(): ViatikDatabase {
  const db = getCurrentDatabase();
  if (!db) throw new Error("No database is open. Wrap calls in DatabaseProvider.");
  return db;
}

function newOption(pollId: string, label: string, position: number, now: string): PollOption {
  return {
    id: crypto.randomUUID(),
    pollId,
    label: label.trim(),
    position,
    createdAt: now,
  };
}

/**
 * Local-only, Dexie-backed group polls. Polls and votes are device-local (like
 * `feedItems`/`packingItems`) and are never pushed through the sync outbox.
 */
export class DexiePollRepository implements PollRepository {
  async listByTrip(tripId: string): Promise<Poll[]> {
    return getDb()
      .polls.where("tripId")
      .equals(tripId)
      .filter((poll) => poll.deletedAt === null)
      .sortBy("createdAt");
  }

  watchByTrip(tripId: string, onChange: (polls: Poll[]) => void): () => void {
    const subscription = liveQuery(() => this.listByTrip(tripId)).subscribe({ next: onChange });
    return () => subscription.unsubscribe();
  }

  async listVotesByPoll(pollId: string): Promise<PollVote[]> {
    return getDb().pollVotes.where("pollId").equals(pollId).toArray();
  }

  watchVotesByPoll(pollId: string, onChange: (votes: PollVote[]) => void): () => void {
    const subscription = liveQuery(() => this.listVotesByPoll(pollId)).subscribe({
      next: onChange,
    });
    return () => subscription.unsubscribe();
  }

  async create(input: NewPoll): Promise<Poll> {
    const db = getDb();
    const question = input.question.trim();
    const labels = input.options.map((label) => label.trim()).filter(Boolean);
    if (!question) throw new Error("Poll question is required");
    if (labels.length < 2) throw new Error("A poll needs at least two options");

    const now = new Date().toISOString();
    const pollId = crypto.randomUUID();
    const options = labels.map((label, index) => newOption(pollId, label, index, now));

    const poll: Poll = {
      id: pollId,
      tripId: input.tripId,
      question,
      options,
      createdBy: input.createdBy,
      status: "active",
      dayDate: input.dayDate ?? null,
      location: input.location ?? null,
      category: input.category ?? null,
      scheduledActivityId: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await db.polls.add(poll);
    logger.debug("Poll created locally", { pollId, tripId: input.tripId });
    return poll;
  }

  async castVote(pollId: string, optionId: string, userId: string): Promise<PollVote> {
    const db = getDb();
    const poll = await db.polls.get(pollId);
    if (!poll || poll.deletedAt !== null) throw new Error("Poll not found");
    if (poll.status !== "active") throw new Error("This poll is closed and no longer accepts votes");
    if (!poll.options.some((option) => option.id === optionId)) {
      throw new Error("That option no longer exists on this poll");
    }

    const now = new Date().toISOString();
    const existing = await db.pollVotes.where("[pollId+userId]").equals([pollId, userId]).first();
    if (existing) {
      const updated: PollVote = { ...existing, optionId, updatedAt: now };
      await db.pollVotes.put(updated);
      return updated;
    }

    const vote: PollVote = {
      id: crypto.randomUUID(),
      pollId,
      optionId,
      userId,
      createdAt: now,
      updatedAt: now,
    };
    await db.pollVotes.add(vote);
    return vote;
  }

  async close(id: string): Promise<Poll> {
    const db = getDb();
    const poll = await db.polls.get(id);
    if (!poll) throw new Error(`Poll ${id} not found`);
    const updated: Poll = { ...poll, status: "closed", updatedAt: new Date().toISOString() };
    await db.polls.put(updated);
    return updated;
  }

  async markScheduled(id: string, activityId: string): Promise<Poll> {
    const db = getDb();
    const poll = await db.polls.get(id);
    if (!poll) throw new Error(`Poll ${id} not found`);
    const updated: Poll = {
      ...poll,
      scheduledActivityId: activityId,
      updatedAt: new Date().toISOString(),
    };
    await db.polls.put(updated);
    return updated;
  }
}

export const pollRepository = new DexiePollRepository();
