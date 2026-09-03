import { liveQuery } from "dexie";

import { getCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { TransactionContext } from "@/lib/db/transaction-context";
import type { Activity } from "@/features/domain/entities";
import type {
  ActivityRepository,
  NewActivity,
} from "@/features/domain/repositories/activity-repository";
import { append } from "@/lib/sync/outbox-transactional";
import { logger } from "@/lib/observability/logger";

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
    return TransactionContext.runInTransaction([db.activities], async (ctx) => {
      const now = new Date().toISOString();
      const activity: Activity = {
        id: input.id,
        tripId: input.tripId,
        dayDate: input.dayDate,
        title: input.title,
        description: input.description ?? null,
        location: input.location ?? null,
        category: input.category ?? "general",
        startTime: input.startTime ?? null,
        endTime: input.endTime ?? null,
        position: input.position,
        createdBy: input.createdBy,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      await ctx.table<Activity>("activities").add(activity);
      await append("activity", "insert", activity, { tx: ctx, baseUpdatedAt: null });
      logger.debug("Activity created locally", { activityId: activity.id });
      return activity;
    });
  }

  async update(
    id: string,
    patch: Partial<Omit<Activity, "id" | "tripId">>
  ): Promise<Activity> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.activities], async (ctx) => {
      const previous = await ctx.table<Activity>("activities").get(id);
      if (!previous) throw new Error(`Activity ${id} not found before update`);
      const updatedAt = new Date().toISOString();
      await ctx.table<Activity>("activities").update(id, { ...patch, updatedAt });
      const activity = await ctx.table<Activity>("activities").get(id);
      if (!activity) throw new Error(`Activity ${id} not found after update`);
      await append("activity", "update", activity, { tx: ctx, baseUpdatedAt: previous.updatedAt });
      logger.debug("Activity updated locally", { activityId: activity.id });
      return activity;
    });
  }

  async move(id: string, dayDate: string, position: number): Promise<Activity> {
    return this.update(id, { dayDate, position });
  }

  async remove(id: string): Promise<void> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.activities], async (ctx) => {
      const activity = await ctx.table<Activity>("activities").get(id);
      if (!activity) return;
      const deletedAt = new Date().toISOString();
      const updated = { ...activity, deletedAt, updatedAt: deletedAt };
      await ctx.table<Activity>("activities").put(updated);
      await append("activity", "update", updated, { tx: ctx, baseUpdatedAt: activity.updatedAt });
      logger.debug("Activity deleted locally", { activityId: id });
    });
  }

  async restore(id: string): Promise<Activity> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.activities], async (ctx) => {
      const activity = await ctx.table<Activity>("activities").get(id);
      if (!activity) throw new Error(`Activity ${id} not found`);
      const updatedAt = new Date().toISOString();
      const restored = { ...activity, deletedAt: null, updatedAt };
      await ctx.table<Activity>("activities").put(restored);
      await append("activity", "update", restored, { tx: ctx, baseUpdatedAt: activity.updatedAt });
      logger.debug("Activity restored locally", { activityId: id });
      return restored;
    });
  }
}

export const activityRepository = new DexieActivityRepository();
