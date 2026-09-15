import { getCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { TransactionContext } from "@/lib/db/transaction-context";
import { append } from "@/lib/sync/outbox-transactional";
import type { ActivityPersonalBudget } from "@/features/domain/entities";
import type {
  ActivityPersonalBudgetRepository,
  NewActivityPersonalBudget,
} from "@/features/domain/repositories/activity-personal-budget-repository";

function getDb(): ViatikDatabase {
  const db = getCurrentDatabase();
  if (!db) throw new Error("No database is open. Wrap calls in DatabaseProvider.");
  return db;
}

export class DexieActivityPersonalBudgetRepository implements ActivityPersonalBudgetRepository {
  getByActivityAndUser(activityId: string, userId: string): Promise<ActivityPersonalBudget | undefined> {
    return getDb().activityPersonalBudgets.where("[activityId+userId]").equals([activityId, userId]).first();
  }

  async upsert(input: NewActivityPersonalBudget): Promise<ActivityPersonalBudget> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.activityPersonalBudgets], async (context) => {
      const table = context.table<ActivityPersonalBudget>("activityPersonalBudgets");
      const existing = await table.where("[activityId+userId]").equals([input.activityId, input.userId]).first();
      const now = new Date().toISOString();
      if (existing) {
        const updated = { ...existing, amountMinor: input.amountMinor, currency: input.currency, version: existing.version + 1, updatedAt: now };
        await table.put(updated);
        await append("activityPersonalBudget", "update", updated, { tx: context, baseUpdatedAt: existing.updatedAt });
        return updated;
      }
      const budget: ActivityPersonalBudget = { ...input, version: 1, createdAt: now, updatedAt: now };
      await table.add(budget);
      await append("activityPersonalBudget", "insert", budget, { tx: context, baseUpdatedAt: null });
      return budget;
    });
  }

  async remove(id: string): Promise<void> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.activityPersonalBudgets], async (context) => {
      const table = context.table<ActivityPersonalBudget>("activityPersonalBudgets");
      const budget = await table.get(id);
      if (!budget) return;
      await table.delete(id);
      await append("activityPersonalBudget", "delete", { id, tripId: budget.tripId, updatedAt: budget.updatedAt }, { tx: context, baseUpdatedAt: budget.updatedAt });
    });
  }
}

export const activityPersonalBudgetRepository = new DexieActivityPersonalBudgetRepository();