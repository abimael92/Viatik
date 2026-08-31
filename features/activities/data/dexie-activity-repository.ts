import { liveQuery } from "dexie";

import { db } from "@/lib/db/dexie";
import type { Activity } from "@/features/domain/entities";
import type {
  ActivityRepository,
  NewActivity,
} from "@/features/domain/repositories/activity-repository";

/** Dexie-backed implementation of `ActivityRepository` — reads/writes IndexedDB only. */
export class DexieActivityRepository implements ActivityRepository {
  async listByTrip(tripId: string): Promise<Activity[]> {
    return db.activities
      .where("tripId")
      .equals(tripId)
      .filter((activity) => activity.deletedAt === null)
      .sortBy("position");
  }

  watchByTrip(tripId: string, onChange: (activities: Activity[]) => void): () => void {
    const subscription = liveQuery(() =>
      db.activities
        .where("tripId")
        .equals(tripId)
        .filter((activity) => activity.deletedAt === null)
        .sortBy("position")
    ).subscribe({ next: onChange });
    return () => subscription.unsubscribe();
  }

  async create(input: NewActivity): Promise<Activity> {
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
    await db.activities.add(activity);
    return activity;
  }

  async update(
    id: string,
    patch: Partial<Omit<Activity, "id" | "tripId">>
  ): Promise<Activity> {
    const updatedAt = new Date().toISOString();
    await db.activities.update(id, { ...patch, updatedAt });
    const activity = await db.activities.get(id);
    if (!activity) throw new Error(`Activity ${id} not found after update`);
    return activity;
  }

  async move(id: string, dayDate: string, position: number): Promise<Activity> {
    return this.update(id, { dayDate, position });
  }

  async remove(id: string): Promise<void> {
    await db.activities.update(id, { deletedAt: new Date().toISOString() });
  }
}

export const activityRepository = new DexieActivityRepository();
