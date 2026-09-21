import { liveQuery } from "dexie";

import { getCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { TransactionContext } from "@/lib/db/transaction-context";
import type { Expense, ExpenseShare } from "@/features/domain/entities";
import type {
  ExpenseRepository,
  NewExpense,
} from "@/features/domain/repositories/expense-repository";
import { buildExpenseFeed, materializeFeedItem } from "@/features/feed/lib/feed-builder";
import { emitFeedItem } from "@/features/feed/data/dexie-feed-repository";
import { append } from "@/lib/sync/outbox-transactional";
import { getSyncUser } from "@/lib/sync/sync-context";
import { logger } from "@/lib/observability/logger";

function getDb(): ViatikDatabase {
  const db = getCurrentDatabase();
  if (!db) throw new Error("No database is open. Wrap calls in DatabaseProvider.");
  return db;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isSyncIdentity(value: string): boolean {
  return isUuid(value) || (value.startsWith("traveler:") && isUuid(value.slice("traveler:".length)));
}

function assertSyncableExpenseParticipants(input: { paidBy: string; createdBy: string; shares: Array<{ userId: string }> }): void {
  const invalid = [input.createdBy, input.paidBy, ...input.shares.map((share) => share.userId)].find((id) => !isSyncIdentity(id));
  if (invalid) throw new Error("Save the traveler to this trip before adding them to an expense.");
}

export class DexieExpenseRepository implements ExpenseRepository {
  async listByTrip(tripId: string): Promise<Expense[]> {
    const db = getDb();
    return db.expenses
      .where("tripId")
      .equals(tripId)
      .filter((expense) => expense.deletedAt === null)
      .toArray();
  }

  async listSharesByExpense(expenseId: string): Promise<ExpenseShare[]> {
    const db = getDb();
    return db.expenseShares.where("expenseId").equals(expenseId).toArray();
  }

  watchByTrip(tripId: string, onChange: (expenses: Expense[]) => void): () => void {
    const subscription = liveQuery(() => this.listByTrip(tripId)).subscribe({ next: onChange });
    return () => subscription.unsubscribe();
  }

  async create(input: NewExpense): Promise<Expense> {
    assertSyncableExpenseParticipants(input);
    const db = getDb();
    return TransactionContext.runInTransaction([db.expenses, db.expenseShares, db.feedItems], async (ctx) => {
      const now = new Date().toISOString();
      const expense: Expense = {
        id: input.id,
        tripId: input.tripId,
        activityId: input.activityId ?? null,
        description: input.description,
        amountMinor: input.amountMinor,
        currency: input.currency,
        exchangeRateToBase: input.exchangeRateToBase ?? null,
        paidBy: input.paidBy,
        paidByTravelerId: input.paidByTravelerId ?? (input.paidBy.startsWith("traveler:") ? input.paidBy.slice("traveler:".length) : null),
        splitType: input.splitType,
        category: input.category ?? null,
        subcategory: input.subcategory ?? null,
        date: input.date ?? now.slice(0, 10),
        createdBy: input.createdBy,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };

      await ctx.table<Expense>("expenses").add(expense);
      await append("expense", "insert", expense, { tx: ctx, baseUpdatedAt: null });

      const shares: ExpenseShare[] = input.shares.map((share) => ({
        id: crypto.randomUUID(),
        expenseId: expense.id,
        paidBy: expense.paidBy,
        userId: share.userId,
        travelerId: share.travelerId ?? (share.userId.startsWith("traveler:") ? share.userId.slice("traveler:".length) : null),
        shareAmountMinor: share.shareAmountMinor,
        sharePercentage: share.sharePercentage,
        splitType: share.splitType ?? expense.splitType,
        settlementStatus: "pending",
        settledAt: null,
        createdAt: now,
        updatedAt: now,
      }));

      await ctx.table<ExpenseShare>("expenseShares").bulkAdd(shares);
      for (const share of shares) {
        await append("expenseShare", "insert", { ...share, tripId: expense.tripId }, { tx: ctx, baseUpdatedAt: null });
      }

      await emitFeedItem(ctx, materializeFeedItem(buildExpenseFeed("added_expense", expense, expense.createdBy)));
      logger.debug("Expense created locally", { expenseId: expense.id });
      return expense;
    });
  }

  async update(
    id: string,
    patch: Partial<Omit<Expense, "id" | "tripId">>
  ): Promise<Expense> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.expenses, db.feedItems], async (ctx) => {
      const previous = await ctx.table<Expense>("expenses").get(id);
      if (!previous) throw new Error(`Expense ${id} not found before update`);
      const updatedAt = new Date().toISOString();
      await ctx.table<Expense>("expenses").update(id, { ...patch, updatedAt });
      const expense = await ctx.table<Expense>("expenses").get(id);
      if (!expense) throw new Error(`Expense ${id} not found after update`);
      await append("expense", "update", expense, { tx: ctx, baseUpdatedAt: previous.updatedAt });
      await emitFeedItem(ctx, materializeFeedItem(buildExpenseFeed("updated_expense", expense, getSyncUser() ?? expense.createdBy)));
      logger.debug("Expense updated locally", { expenseId: expense.id });
      return expense;
    });
  }

  async replaceShares(expenseId: string, shares: NewExpense["shares"]): Promise<void> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.expenses, db.expenseShares], async (ctx) => {
      const expense = await ctx.table<Expense>("expenses").get(expenseId);
      if (!expense) throw new Error("Expense not found");
      assertSyncableExpenseParticipants({ paidBy: expense.paidBy, createdBy: expense.createdBy, shares });
      const existing = await ctx.table<ExpenseShare>("expenseShares").where("expenseId").equals(expenseId).toArray();
      const now = new Date().toISOString();
      const nextUsers = new Set(shares.map((share) => share.userId));
      const removed = existing.filter((share) => !nextUsers.has(share.userId));

      await ctx.table<ExpenseShare>("expenseShares").bulkDelete(removed.map((share) => share.id));
      for (const share of removed) {
        await append("expenseShare", "delete", { ...share, tripId: expense.tripId, mutatedAt: now }, { tx: ctx, baseUpdatedAt: share.updatedAt });
      }

      const existingByUser = new Map(existing.map((share) => [share.userId, share]));
      const replacements: ExpenseShare[] = shares.map((share) => {
        const previous = existingByUser.get(share.userId);
        return {
          id: previous?.id ?? crypto.randomUUID(),
          expenseId,
          paidBy: expense.paidBy,
          userId: share.userId,
          travelerId: share.travelerId ?? (share.userId.startsWith("traveler:") ? share.userId.slice("traveler:".length) : null),
          shareAmountMinor: share.shareAmountMinor,
          sharePercentage: share.sharePercentage,
          splitType: share.splitType ?? expense.splitType,
          settlementStatus: previous?.settlementStatus ?? "pending",
          settledAt: previous?.settledAt ?? null,
          createdAt: previous?.createdAt ?? now,
          updatedAt: now,
        };
      });

      await ctx.table<ExpenseShare>("expenseShares").bulkPut(replacements);
      for (const share of replacements) {
        await append(
          "expenseShare",
          existingByUser.has(share.userId) ? "update" : "insert",
          { ...share, tripId: expense.tripId },
          { tx: ctx, baseUpdatedAt: existingByUser.get(share.userId)?.updatedAt ?? null }
        );
      }
    });
  }

  async settleShare(shareId: string): Promise<void> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.expenseShares], async (ctx) => {
      const share = await ctx.table<ExpenseShare>("expenseShares").get(shareId);
      if (!share || share.settlementStatus === "settled") return;
      const now = new Date().toISOString();
      await ctx.table<ExpenseShare>("expenseShares").put({
        ...share,
        settlementStatus: "settled",
        settledAt: now,
        updatedAt: now,
      });
    });
  }

  async remove(id: string): Promise<void> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.expenses, db.feedItems], async (ctx) => {
      const expense = await ctx.table<Expense>("expenses").get(id);
      if (!expense) return;
      const deletedAt = new Date().toISOString();
      const updated = { ...expense, deletedAt, updatedAt: deletedAt };
      await ctx.table<Expense>("expenses").put(updated);
      await append("expense", "update", updated, { tx: ctx, baseUpdatedAt: expense.updatedAt });
      await emitFeedItem(ctx, materializeFeedItem(buildExpenseFeed("deleted_expense", updated, getSyncUser() ?? updated.createdBy)));
      logger.debug("Expense deleted locally", { expenseId: id });
    });
  }
}

export const expenseRepository = new DexieExpenseRepository();
