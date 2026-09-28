import { liveQuery } from "dexie";

import { TRIP_TASK_TITLE_MAX, type TripTask } from "@/features/trips/domain/trip-task";
import { getCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { TransactionContext } from "@/lib/db/transaction-context";
import { append } from "@/lib/sync/outbox-transactional";

function getDb(): ViatikDatabase {
  const db = getCurrentDatabase();
  if (!db) throw new Error("No database is open. Wrap calls in DatabaseProvider.");
  return db;
}

function cleanTitle(title: string): string {
  const value = title.trim();
  if (!value) throw new Error("errors.taskTitleRequired");
  if (value.length > TRIP_TASK_TITLE_MAX) throw new Error("errors.taskTitleTooLong");
  return value;
}

function cleanOptional(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed.slice(0, 2000) : null;
}

export class DexieTripTaskRepository {
  watchByTrip(tripId: string, onChange: (tasks: TripTask[]) => void): () => void {
    const subscription = liveQuery(async () => {
      const tasks = await getDb()
        .tripTasks.where("tripId")
        .equals(tripId)
        .filter((task) => task.deletedAt === null)
        .toArray();
      return tasks.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    }).subscribe({ next: onChange, error: () => onChange([]) });
    return () => subscription.unsubscribe();
  }

  async create(input: {
    id: string;
    tripId: string;
    creatorId: string;
    title: string;
    description?: string | null;
    assigneeId?: string | null;
    attachments?: string[];
  }): Promise<TripTask> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.tripTasks], async (tx) => {
      const now = new Date().toISOString();
      const task: TripTask = {
        id: input.id,
        tripId: input.tripId,
        creatorId: input.creatorId,
        assigneeId: input.assigneeId || null,
        title: cleanTitle(input.title),
        description: cleanOptional(input.description),
        resolutionText: null,
        status: "open",
        attachments: input.attachments ?? [],
        createdBy: input.creatorId,
        updatedBy: input.creatorId,
        deletedBy: null,
        version: 1,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      await tx.table<TripTask>("tripTasks").add(task);
      await append("tripTask", "insert", task, { tx, baseUpdatedAt: null });
      return task;
    });
  }

  async resolve(id: string, userId: string, resolutionText: string, attachments: string[]): Promise<TripTask> {
    const resolution = cleanOptional(resolutionText);
    if (!resolution) throw new Error("errors.resolutionRequired");
    const db = getDb();
    const existing = await db.tripTasks.get(id);
    if (!existing || existing.deletedAt) throw new Error("That task is no longer available.");
    return TransactionContext.runInTransaction([db.tripTasks], async (tx) => {
      const task: TripTask = {
        ...existing,
        status: "resolved",
        resolutionText: resolution,
        attachments: [...existing.attachments, ...attachments],
        updatedBy: userId,
        version: existing.version + 1,
        updatedAt: new Date().toISOString(),
      };
      await tx.table<TripTask>("tripTasks").put(task);
      await append("tripTask", "update", task, { tx, baseUpdatedAt: existing.updatedAt });
      return task;
    });
  }
}

export const tripTaskRepository = new DexieTripTaskRepository();
