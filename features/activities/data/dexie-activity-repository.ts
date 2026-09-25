import { liveQuery } from "dexie";

import { getCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { TransactionContext } from "@/lib/db/transaction-context";
import type { Activity, ActivityChecklistItem } from "@/features/domain/entities";
import type {
  ActivityRepository,
  NewActivity,
} from "@/features/domain/repositories/activity-repository";
import { buildActivityFeed, buildChecklistItemFeed, materializeFeedItem, type ChecklistFeedAction } from "@/features/feed/lib/feed-builder";
import { emitFeedItem } from "@/features/feed/data/dexie-feed-repository";
import { append } from "@/lib/sync/outbox-transactional";
import { getSyncUser } from "@/lib/sync/sync-context";
import { logger } from "@/lib/observability/logger";
import { normalizeActivityCategory } from "@/features/activities/domain/activity-category";
import { normalizeActivityAttachments } from "@/features/activities/domain/activity-attachments";
import { normalizeActivityChecklist } from "@/features/activities/domain/activity-checklist";
import { withOwnAttendance, type OwnAttendanceStatus } from "@/features/activities/lib/own-attendance";

function getDb(): ViatikDatabase {
  const db = getCurrentDatabase();
  if (!db) throw new Error("No database is open. Wrap calls in DatabaseProvider.");
  return db;
}

/** Dexie-backed implementation of `ActivityRepository` — reads/writes IndexedDB only. */
export class DexieActivityRepository implements ActivityRepository {
  async listByTrip(tripId: string): Promise<Activity[]> {
    const db = getDb();
    return db.activities
      .where("tripId")
      .equals(tripId)
      .filter((activity) => activity.deletedAt === null)
      .sortBy("position");
  }

  watchByTrip(tripId: string, onChange: (activities: Activity[]) => void): () => void {
    const subscription = liveQuery(() =>
      getDb().activities
        .where("tripId")
        .equals(tripId)
        .filter((activity) => activity.deletedAt === null)
        .sortBy("position")
    ).subscribe({ next: onChange });
    return () => subscription.unsubscribe();
  }

  async create(input: NewActivity): Promise<Activity> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.activities, db.feedItems], async (ctx) => {
      const now = new Date().toISOString();
      const actorId = getSyncUser() ?? input.createdBy;
      const activity: Activity = {
        id: input.id,
        tripId: input.tripId,
        dayDate: input.dayDate,
        title: input.title,
        description: input.description ?? null,
        placeName: input.placeName ?? null,
        formattedAddress: input.formattedAddress ?? null,
        placeId: input.placeId ?? null,
        category: normalizeActivityCategory(input.category),
        timingSpecificity: input.timingSpecificity ?? "exact",
        flexiblePeriod: input.timingSpecificity === "flexible" ? input.flexiblePeriod ?? "anytime" : null,
        startTime: input.startTime ?? null,
        endTime: input.endTime ?? null,
        bookingReference: input.bookingReference?.trim() || null,
        participants: input.participants ?? [],
        pollStatus: input.pollStatus ?? "confirmed",
        votingEndsAt: input.votingEndsAt ?? null,
        pollOptions: input.pollOptions ?? [],
        pollVotes: input.pollVotes ?? [],
        attachments: normalizeActivityAttachments(input.attachments),
        checklist: normalizeActivityChecklist(input.checklist),
        position: input.position,
        estimatedCostMinor: input.estimatedCostMinor ?? null,
        createdBy: actorId,
        updatedBy: actorId,
        deletedBy: null,
        version: 1,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      await ctx.table<Activity>("activities").add(activity);
      await append("activity", "insert", activity, { tx: ctx, baseUpdatedAt: null });
      await emitFeedItem(ctx, materializeFeedItem(buildActivityFeed("added_activity", activity, activity.createdBy)));
      logger.debug("Activity created locally", { activityId: activity.id });
      return activity;
    });
  }

  async update(
    id: string,
    patch: Partial<Omit<Activity, "id" | "tripId">>
  ): Promise<Activity> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.activities, db.feedItems], async (ctx) => {
      const previous = await ctx.table<Activity>("activities").get(id);
      if (!previous) throw new Error(`Activity ${id} not found before update`);
      const updatedAt = new Date().toISOString();
      const actorId = getSyncUser() ?? previous.createdBy;
      const nextPatch = {
        ...patch,
        category: patch.category ? normalizeActivityCategory(patch.category) : previous.category,
        ...(patch.attachments !== undefined
          ? { attachments: normalizeActivityAttachments(patch.attachments) }
          : {}),
        ...(patch.checklist !== undefined
          ? { checklist: normalizeActivityChecklist(patch.checklist) }
          : {}),
        updatedBy: actorId,
        version: (previous.version ?? 1) + 1,
        updatedAt,
      };
      await ctx.table<Activity>("activities").update(id, nextPatch);
      const activity = await ctx.table<Activity>("activities").get(id);
      if (!activity) throw new Error(`Activity ${id} not found after update`);
      await append("activity", "update", activity, { tx: ctx, baseUpdatedAt: previous.updatedAt });
      await emitFeedItem(ctx, materializeFeedItem(buildActivityFeed("updated_activity", activity, getSyncUser() ?? activity.createdBy)));
      logger.debug("Activity updated locally", { activityId: activity.id });
      return activity;
    });
  }

  async updateChecklist(
    id: string,
    checklist: ActivityChecklistItem[],
    event: { action: ChecklistFeedAction; itemTitle: string },
  ): Promise<Activity> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.activities, db.feedItems], async (ctx) => {
      const previous = await ctx.table<Activity>("activities").get(id);
      if (!previous) throw new Error(`Activity ${id} not found before update`);
      const updatedAt = new Date().toISOString();
      const actorId = getSyncUser() ?? previous.createdBy;
      const nextChecklist = normalizeActivityChecklist(checklist);
      await ctx.table<Activity>("activities").update(id, {
        checklist: nextChecklist,
        updatedBy: actorId,
        version: (previous.version ?? 1) + 1,
        updatedAt,
      });
      const activity = await ctx.table<Activity>("activities").get(id);
      if (!activity) throw new Error(`Activity ${id} not found after update`);
      await append("activity", "update", activity, { tx: ctx, baseUpdatedAt: previous.updatedAt });
      await emitFeedItem(
        ctx,
        materializeFeedItem(buildChecklistItemFeed(event.action, activity, actorId, event.itemTitle)),
      );
      logger.debug("Activity checklist updated locally", { activityId: activity.id, action: event.action });
      return activity;
    });
  }

  async setAttendance(id: string, userId: string, status: OwnAttendanceStatus): Promise<Activity> {
    const actorId = getSyncUser();
    if (actorId && actorId !== userId) throw new Error("You can only change your own attendance");
    const db = getDb();
    return TransactionContext.runInTransaction([db.activities], async (ctx) => {
      const previous = await ctx.table<Activity>("activities").get(id);
      if (!previous) throw new Error(`Activity ${id} not found before update`);
      const participants = withOwnAttendance(previous.participants, userId, status);
      if (participants === previous.participants) return previous;
      const updatedAt = new Date().toISOString();
      const next = {
        ...previous,
        participants,
        updatedBy: actorId ?? userId,
        version: (previous.version ?? 1) + 1,
        updatedAt,
      };
      await ctx.table<Activity>("activities").put(next);
      await append("activity", "update", next, { tx: ctx, baseUpdatedAt: previous.updatedAt });
      logger.debug("Activity attendance updated locally", { activityId: id, userId, status });
      return next;
    });
  }

  async cancelProposal(id: string): Promise<Activity> {
    const activity = await getDb().activities.get(id);
    if (!activity) throw new Error(`Activity ${id} not found`);
    const actorId = getSyncUser();
    if (!actorId || actorId !== activity.createdBy) throw new Error("Only the proposal creator can cancel it");
    return this.update(id, { pollStatus: "cancelled", votingEndsAt: null });
  }

  async move(id: string, dayDate: string, position: number): Promise<Activity> {
    return this.update(id, { dayDate, position });
  }

  async remove(id: string): Promise<void> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.activities, db.feedItems], async (ctx) => {
      const activity = await ctx.table<Activity>("activities").get(id);
      if (!activity) return;
      const deletedAt = new Date().toISOString();
      const actorId = getSyncUser() ?? activity.createdBy;
      const updated = { ...activity, deletedAt, deletedBy: actorId, updatedBy: actorId, version: (activity.version ?? 1) + 1, updatedAt: deletedAt };
      await ctx.table<Activity>("activities").put(updated);
      await append("activity", "update", updated, { tx: ctx, baseUpdatedAt: activity.updatedAt });
      await emitFeedItem(ctx, materializeFeedItem(buildActivityFeed("deleted_activity", updated, getSyncUser() ?? updated.createdBy)));
      logger.debug("Activity deleted locally", { activityId: id });
    });
  }

  async restore(id: string): Promise<Activity> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.activities, db.feedItems], async (ctx) => {
      const activity = await ctx.table<Activity>("activities").get(id);
      if (!activity) throw new Error(`Activity ${id} not found`);
      const updatedAt = new Date().toISOString();
      const actorId = getSyncUser() ?? activity.createdBy;
      const restored = { ...activity, deletedAt: null, deletedBy: null, restoredAt: updatedAt, restoredBy: actorId, updatedBy: actorId, version: (activity.version ?? 1) + 1, updatedAt };
      await ctx.table<Activity>("activities").put(restored);
      await append("activity", "update", restored, { tx: ctx, baseUpdatedAt: activity.updatedAt });
      await emitFeedItem(ctx, materializeFeedItem(buildActivityFeed("restored_activity", restored, getSyncUser() ?? restored.createdBy)));
      logger.debug("Activity restored locally", { activityId: id });
      return restored;
    });
  }
}

export const activityRepository = new DexieActivityRepository();
