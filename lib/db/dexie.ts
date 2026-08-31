import Dexie, { type EntityTable } from "dexie";

import type { Activity, Expense, ExpenseShare, Trip, TripMember } from "@/features/domain/entities";
import type { OutboxMutation } from "@/lib/sync/types";

/**
 * The local IndexedDB database — the single source of truth for domain data
 * on this device. Every read/write for trips, activities, and expenses goes
 * through here first; Supabase is synced to/from it asynchronously (see
 * `lib/sync/sync-engine.ts`), never read from directly by the UI.
 */
export class ViatikDatabase extends Dexie {
  trips!: EntityTable<Trip, "id">;
  tripMembers!: EntityTable<TripMember, "id">;
  activities!: EntityTable<Activity, "id">;
  expenses!: EntityTable<Expense, "id">;
  expenseShares!: EntityTable<ExpenseShare, "id">;
  /** FIFO queue of not-yet-synced mutations, drained by `SyncEngine`. */
  outboxMutations!: EntityTable<OutboxMutation, "id">;

  constructor() {
    super("viatik");

    this.version(1).stores({
      trips: "id, ownerId, updatedAt, deletedAt",
      tripMembers: "id, tripId, userId, [tripId+userId]",
      activities: "id, tripId, [tripId+dayDate], [tripId+dayDate+position], updatedAt, deletedAt",
      expenses: "id, tripId, activityId, updatedAt, deletedAt",
      expenseShares: "id, expenseId, userId, [expenseId+userId]",
    });

    this.version(2).stores({
      outboxMutations: "id, tripId, entityType, createdAt",
    });
  }
}

export const db = new ViatikDatabase();
