import { liveQuery } from "dexie";

import { db } from "@/lib/db/dexie";
import type { Expense, ExpenseShare } from "@/features/domain/entities";
import type {
  ExpenseRepository,
  NewExpense,
} from "@/features/domain/repositories/expense-repository";
import { enqueueMutation } from "@/lib/sync/outbox";

export class DexieExpenseRepository implements ExpenseRepository {
  async listByTrip(tripId: string): Promise<Expense[]> {
    return db.expenses
      .where("tripId")
      .equals(tripId)
      .filter((expense) => expense.deletedAt === null)
      .toArray();
  }

  async listSharesByExpense(expenseId: string): Promise<ExpenseShare[]> {
    return db.expenseShares.where("expenseId").equals(expenseId).toArray();
  }

  watchByTrip(tripId: string, onChange: (expenses: Expense[]) => void): () => void {
    const subscription = liveQuery(() => this.listByTrip(tripId)).subscribe({ next: onChange });
    return () => subscription.unsubscribe();
  }

  async create(input: NewExpense): Promise<Expense> {
    const now = new Date().toISOString();
    const expense: Expense = {
      id: input.id,
      tripId: input.tripId,
      activityId: input.activityId ?? null,
      description: input.description,
      amount: input.amount,
      currency: input.currency,
      paidBy: input.paidBy,
      splitType: input.splitType,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    await db.expenses.add(expense);
    await enqueueMutation({
      entityType: "expense",
      entityId: expense.id,
      tripId: expense.tripId,
      operation: "insert",
      payload: expense as unknown as Record<string, unknown>,
      mutatedAt: expense.updatedAt,
    });

    const shares: ExpenseShare[] = input.shares.map((share) => ({
      id: crypto.randomUUID(),
      expenseId: expense.id,
      userId: share.userId,
      shareAmount: share.shareAmount,
      sharePercentage: share.sharePercentage,
      createdAt: now,
      updatedAt: now,
    }));

    await db.expenseShares.bulkAdd(shares);
    for (const share of shares) {
      await enqueueMutation({
        entityType: "expenseShare",
        entityId: share.id,
        tripId: expense.tripId,
        operation: "insert",
        payload: share as unknown as Record<string, unknown>,
        mutatedAt: share.updatedAt,
      });
    }

    return expense;
  }

  async update(
    id: string,
    patch: Partial<Omit<Expense, "id" | "tripId">>
  ): Promise<Expense> {
    const updatedAt = new Date().toISOString();
    await db.expenses.update(id, { ...patch, updatedAt });
    const expense = await db.expenses.get(id);
    if (!expense) throw new Error(`Expense ${id} not found after update`);
    await enqueueMutation({
      entityType: "expense",
      entityId: expense.id,
      tripId: expense.tripId,
      operation: "update",
      payload: expense as unknown as Record<string, unknown>,
      mutatedAt: expense.updatedAt,
    });
    return expense;
  }

  async remove(id: string): Promise<void> {
    const expense = await db.expenses.get(id);
    const deletedAt = new Date().toISOString();
    await db.expenses.update(id, { deletedAt, updatedAt: deletedAt });
    await enqueueMutation({
      entityType: "expense",
      entityId: id,
      tripId: expense?.tripId ?? "",
      operation: "delete",
      payload: null,
      mutatedAt: deletedAt,
    });
  }
}

export const expenseRepository = new DexieExpenseRepository();
