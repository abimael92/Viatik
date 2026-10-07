import { liveQuery } from "dexie";

import { getCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { TransactionContext } from "@/lib/db/transaction-context";
import type { Expense, ExpenseShare } from "@/features/domain/entities";
import { summarizeExpenseLineItems } from "@/features/expenses/lib/expense-items";
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

function assertLineItemShareTotals(
  expense: Pick<Expense, "amountMinor" | "lineItems">,
  shares: NewExpense["shares"],
): void {
  if (!expense.lineItems?.length) return;
  const summary = summarizeExpenseLineItems(expense.lineItems);
  if (summary.amountMinor !== expense.amountMinor) {
    throw new Error("Expense total does not match its line items.");
  }
  const expected = new Map(summary.shares.map((share) => [share.userId, share.shareAmountMinor]));
  const actual = new Map(shares.map((share) => [share.userId, share.shareAmountMinor]));
  if (
    expected.size !== actual.size ||
    [...expected].some(([userId, amount]) => actual.get(userId) !== amount)
  ) {
    throw new Error("Expense shares do not match its item allocations.");
  }
}

async function replaceExpenseShares(
  ctx: TransactionContext,
  expense: Expense,
  shares: NewExpense["shares"],
  now: string,
): Promise<void> {
  assertSyncableExpenseParticipants({ paidBy: expense.paidBy, createdBy: expense.createdBy, shares });
  assertLineItemShareTotals(expense, shares);
  const existing = await ctx.table<ExpenseShare>("expenseShares").where("expenseId").equals(expense.id).toArray();
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
      expenseId: expense.id,
      paidBy: expense.paidBy,
      userId: share.userId,
      travelerId: share.travelerId ?? (share.userId.startsWith("traveler:") ? share.userId.slice("traveler:".length) : null),
      shareAmountMinor: share.shareAmountMinor,
      sharePercentage: share.sharePercentage,
      splitType: share.splitType ?? expense.splitType,
      settlementStatus: "pending",
      settledAt: null,
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

  watchSharesByExpenses(expenseIds: string[], onChange: (shares: ExpenseShare[]) => void): () => void {
    const ids = [...new Set(expenseIds.filter(Boolean))];
    const subscription = liveQuery(async () => {
      if (!ids.length) return [] as ExpenseShare[];
      return getDb().expenseShares.where("expenseId").anyOf(ids).toArray();
    }).subscribe({ next: onChange });
    return () => subscription.unsubscribe();
  }

  watchByTrip(tripId: string, onChange: (expenses: Expense[]) => void): () => void {
    const subscription = liveQuery(() => this.listByTrip(tripId)).subscribe({ next: onChange });
    return () => subscription.unsubscribe();
  }

  async create(input: NewExpense): Promise<Expense> {
    assertSyncableExpenseParticipants(input);
    assertLineItemShareTotals(input, input.shares);
    const db = getDb();
    return TransactionContext.runInTransaction([db.expenses, db.expenseShares, db.feedItems], async (ctx) => {
      const now = new Date().toISOString();
      const expense: Expense = {
        id: input.id,
        tripId: input.tripId,
        activityId: input.activityId ?? null,
        description: input.description,
        amountMinor: input.amountMinor,
        ...(input.lineItems?.length ? { lineItems: input.lineItems } : {}),
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
    patch: Partial<Omit<Expense, "id" | "tripId">>,
    shares?: NewExpense["shares"],
  ): Promise<Expense> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.expenses, db.expenseShares, db.feedItems], async (ctx) => {
      const previous = await ctx.table<Expense>("expenses").get(id);
      if (!previous) throw new Error(`Expense ${id} not found before update`);
      if (
        shares === undefined &&
        (previous.lineItems?.length || patch.lineItems?.length) &&
        (patch.amountMinor !== undefined || patch.lineItems !== undefined)
      ) {
        throw new Error("Itemized expense updates require matching shares.");
      }
      const updatedAt = new Date().toISOString();
      const expense = { ...previous, ...patch, updatedAt };
      if (shares) assertLineItemShareTotals(expense, shares);
      await ctx.table<Expense>("expenses").put(expense);
      await append("expense", "update", expense, { tx: ctx, baseUpdatedAt: previous.updatedAt });
      if (shares) await replaceExpenseShares(ctx, expense, shares, updatedAt);
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
      await replaceExpenseShares(ctx, expense, shares, new Date().toISOString());
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
