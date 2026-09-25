import { liveQuery } from "dexie";

import type { Decision, DecisionOption, DecisionVote } from "@/features/domain/entities";
import { getCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { TransactionContext } from "@/lib/db/transaction-context";
import { logger } from "@/lib/observability/logger";
import { append } from "@/lib/sync/outbox-transactional";
import type { NewPoll, Poll, PollRepository, PollVote } from "@/features/polls/domain/poll-types";

function getDb(): ViatikDatabase {
  const db = getCurrentDatabase();
  if (!db) throw new Error("No database is open. Wrap calls in DatabaseProvider.");
  return db;
}

function hintString(resolution: Record<string, unknown> | null, key: string): string | null {
  const value = resolution?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toPoll(decision: Decision, options: DecisionOption[]): Poll {
  return {
    id: decision.id,
    tripId: decision.tripId,
    question: decision.question,
    options: options
      .filter((option) => option.deletedAt === null)
      .sort((left, right) => left.position - right.position)
      .map((option) => ({
        id: option.id,
        pollId: decision.id,
        label: option.label,
        position: option.position,
        createdAt: option.createdAt,
      })),
    createdBy: decision.createdBy,
    status: decision.status === "open" || decision.status === "draft" ? "active" : "closed",
    dayDate: hintString(decision.resolution, "dayDate"),
    location: hintString(decision.resolution, "location"),
    category: hintString(decision.resolution, "category"),
    scheduledActivityId: hintString(decision.resolution, "scheduledActivityId"),
    createdAt: decision.createdAt,
    updatedAt: decision.updatedAt,
    deletedAt: decision.deletedAt,
  };
}

function toVote(vote: DecisionVote): PollVote {
  return {
    id: vote.id,
    pollId: vote.decisionId,
    optionId: vote.optionId,
    userId: vote.userId,
    createdAt: vote.createdAt,
    updatedAt: vote.updatedAt,
  };
}

/**
 * Crew polls are shared decisions. Every trip member can read them and vote.
 * The Poll shape is what the screen renders.
 */
export class DexiePollRepository implements PollRepository {
  async listByTrip(tripId: string): Promise<Poll[]> {
    const db = getDb();
    const decisions = await db.decisions
      .where("tripId")
      .equals(tripId)
      .filter((decision) => decision.deletedAt === null && decision.type === "standalone_poll")
      .toArray();
    const decisionIds = new Set(decisions.map((decision) => decision.id));
    const options = decisions.length
      ? await db.decisionOptions.where("decisionId").anyOf([...decisionIds]).toArray()
      : [];
    const shared = decisions.map((decision) =>
      toPoll(decision, options.filter((option) => option.decisionId === decision.id)),
    );
    const legacy = await db.polls
      .where("tripId")
      .equals(tripId)
      .filter((poll) => poll.deletedAt === null && !decisionIds.has(poll.id))
      .toArray();
    return [...shared, ...legacy].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  watchByTrip(tripId: string, onChange: (polls: Poll[]) => void): () => void {
    const subscription = liveQuery(() => this.listByTrip(tripId)).subscribe({ next: onChange });
    return () => subscription.unsubscribe();
  }

  async listVotesByPoll(pollId: string): Promise<PollVote[]> {
    const shared = (await getDb().decisionVotes.where("decisionId").equals(pollId).toArray())
      .filter((vote) => vote.deletedAt === null)
      .map(toVote);
    if (shared.length > 0) return shared;
    return getDb().pollVotes.where("pollId").equals(pollId).toArray();
  }

  watchVotesByPoll(pollId: string, onChange: (votes: PollVote[]) => void): () => void {
    const subscription = liveQuery(() => this.listVotesByPoll(pollId)).subscribe({ next: onChange });
    return () => subscription.unsubscribe();
  }

  async create(input: NewPoll): Promise<Poll> {
    const db = getDb();
    const question = input.question.trim();
    const labels = input.options.map((label) => label.trim()).filter(Boolean);
    if (!question) throw new Error("Poll question is required");
    if (labels.length < 2) throw new Error("A poll needs at least two options");

    const now = new Date().toISOString();
    const decisionId = crypto.randomUUID();
    const decision: Decision = {
      id: decisionId,
      tripId: input.tripId,
      type: "standalone_poll",
      question,
      status: "open",
      votingEndsAt: null,
      resolution: {
        dayDate: input.dayDate ?? null,
        location: input.location ?? null,
        category: input.category ?? null,
        scheduledActivityId: null,
      },
      resolvedBy: null,
      resolvedAt: null,
      createdAt: now,
      createdBy: input.createdBy,
      updatedAt: now,
      updatedBy: input.createdBy,
      version: 1,
      deletedAt: null,
      deletedBy: null,
    };
    const options: DecisionOption[] = labels.map((label, index) => ({
      id: crypto.randomUUID(),
      decisionId,
      label,
      metadata: {},
      position: index,
      createdAt: now,
      createdBy: input.createdBy,
      updatedAt: now,
      updatedBy: input.createdBy,
      version: 1,
      deletedAt: null,
      deletedBy: null,
    }));

    await TransactionContext.runInTransaction([db.decisions, db.decisionOptions], async (ctx) => {
      await ctx.table<Decision>("decisions").add(decision);
      await append("decision", "insert", decision, { tx: ctx, baseUpdatedAt: null });
      for (const option of options) {
        await ctx.table<DecisionOption>("decisionOptions").add(option);
        await append("decisionOption", "insert", { ...option, tripId: input.tripId }, { tx: ctx, baseUpdatedAt: null });
      }
    });
    logger.debug("Poll created for the crew", { pollId: decisionId, tripId: input.tripId });
    return toPoll(decision, options);
  }

  async castVote(pollId: string, optionId: string, userId: string): Promise<PollVote> {
    const db = getDb();
    const decision = await db.decisions.get(pollId);
    if (!decision || decision.deletedAt !== null) return this.castLegacyVote(pollId, optionId, userId);
    if (decision.status !== "open" && decision.status !== "draft") {
      throw new Error("This poll is closed and no longer accepts votes");
    }
    const option = await db.decisionOptions.get(optionId);
    if (!option || option.decisionId !== pollId || option.deletedAt !== null) {
      throw new Error("That option no longer exists on this poll");
    }
    const now = new Date().toISOString();
    const existing = await db.decisionVotes.where("[decisionId+userId]").equals([pollId, userId]).first();
    const vote: DecisionVote = existing
      ? { ...existing, optionId, updatedAt: now, updatedBy: userId, deletedAt: null, deletedBy: null }
      : {
          id: crypto.randomUUID(),
          decisionId: pollId,
          optionId,
          userId,
          createdAt: now,
          createdBy: userId,
          updatedAt: now,
          updatedBy: userId,
          version: 1,
          deletedAt: null,
          deletedBy: null,
        };
    await TransactionContext.runInTransaction([db.decisionVotes], async (ctx) => {
      await ctx.table<DecisionVote>("decisionVotes").put(vote);
      await append(existing ? "decisionVote" : "decisionVote", existing ? "update" : "insert", { ...vote, tripId: decision.tripId }, {
        tx: ctx,
        baseUpdatedAt: existing ? existing.updatedAt : null,
      });
    });
    return toVote(vote);
  }

  async close(id: string): Promise<Poll> {
    const db = getDb();
    const decision = await db.decisions.get(id);
    if (!decision) return this.closeLegacy(id);
    const updated: Decision = { ...decision, status: "closed", updatedAt: new Date().toISOString() };
    await TransactionContext.runInTransaction([db.decisions], async (ctx) => {
      await ctx.table<Decision>("decisions").put(updated);
      await append("decision", "update", updated, { tx: ctx, baseUpdatedAt: decision.updatedAt });
    });
    return toPoll(updated, await db.decisionOptions.where("decisionId").equals(id).toArray());
  }

  async markScheduled(id: string, activityId: string): Promise<Poll> {
    const db = getDb();
    const decision = await db.decisions.get(id);
    if (!decision) return this.scheduleLegacy(id, activityId);
    const updated: Decision = {
      ...decision,
      resolution: { ...(decision.resolution ?? {}), scheduledActivityId: activityId },
      updatedAt: new Date().toISOString(),
    };
    await TransactionContext.runInTransaction([db.decisions], async (ctx) => {
      await ctx.table<Decision>("decisions").put(updated);
      await append("decision", "update", updated, { tx: ctx, baseUpdatedAt: decision.updatedAt });
    });
    return toPoll(updated, await db.decisionOptions.where("decisionId").equals(id).toArray());
  }

  private async castLegacyVote(pollId: string, optionId: string, userId: string): Promise<PollVote> {
    const db = getDb();
    const poll = await db.polls.get(pollId);
    if (!poll || poll.deletedAt !== null) throw new Error("Poll not found");
    if (poll.status !== "active") throw new Error("This poll is closed and no longer accepts votes");
    if (!poll.options.some((option) => option.id === optionId)) throw new Error("That option no longer exists on this poll");
    const now = new Date().toISOString();
    const existing = await db.pollVotes.where("[pollId+userId]").equals([pollId, userId]).first();
    if (existing) {
      const updated: PollVote = { ...existing, optionId, updatedAt: now };
      await db.pollVotes.put(updated);
      return updated;
    }
    const vote: PollVote = { id: crypto.randomUUID(), pollId, optionId, userId, createdAt: now, updatedAt: now };
    await db.pollVotes.add(vote);
    return vote;
  }

  private async closeLegacy(id: string): Promise<Poll> {
    const poll = await getDb().polls.get(id);
    if (!poll) throw new Error(`Poll ${id} not found`);
    const updated: Poll = { ...poll, status: "closed", updatedAt: new Date().toISOString() };
    await getDb().polls.put(updated);
    return updated;
  }

  private async scheduleLegacy(id: string, activityId: string): Promise<Poll> {
    const poll = await getDb().polls.get(id);
    if (!poll) throw new Error(`Poll ${id} not found`);
    const updated: Poll = { ...poll, scheduledActivityId: activityId, updatedAt: new Date().toISOString() };
    await getDb().polls.put(updated);
    return updated;
  }
}

export const pollRepository = new DexiePollRepository();
