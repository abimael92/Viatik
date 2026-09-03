import { describe, expect, it } from "vitest";

import type { Expense, ExpenseSettlement, ExpenseShare } from "@/features/domain/entities";
import { expenseShareToRow, expenseToRow, rowToExpense, rowToExpenseShare, rowToSettlement, settlementToRow } from "@/lib/supabase/mappers";

const timestamps = {
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("money mappers", () => {
  it("serializes expense minor units as decimal strings", () => {
    const expense: Expense = {
      id: "expense-1",
      tripId: "trip-1",
      activityId: null,
      description: "Charter",
      amountMinor: 9007199254n,
      currency: "USD",
      paidBy: "user-1",
      splitType: "equal",
      createdBy: "user-1",
      ...timestamps,
      deletedAt: null,
    };

    expect(expenseToRow(expense).amount).toBe("9007199254");
    expect(rowToExpense(expenseToRow(expense))).toEqual(expense);
  });

  it("rejects ambiguous fractional values from legacy remote columns", () => {
    expect(() => rowToExpense({ amount: "123.45" })).toThrow("Invalid remote amount");
    expect(() => rowToExpenseShare({ share_amount: null })).toThrow("Invalid remote share_amount");
  });

  it("rejects values outside the current remote column capacity", () => {
    const expense = {
      id: "expense-1", tripId: "trip-1", activityId: null, description: "Too large", amountMinor: 10_000_000_000n, currency: "USD", paidBy: "user-1", splitType: "equal" as const, createdBy: "user-1", ...timestamps, deletedAt: null,
    };
    expect(() => expenseToRow(expense)).toThrow("Invalid remote amount");
  });

  it("round-trips share and settlement minor units", () => {
    const share: ExpenseShare = { id: "share-1", expenseId: "expense-1", userId: "user-1", shareAmountMinor: 5001n, sharePercentage: 50, ...timestamps };
    const settlement: ExpenseSettlement = { id: "settlement-1", tripId: "trip-1", fromUserId: "user-1", toUserId: "user-2", amountMinor: 5001n, currency: "USD", createdBy: "user-1", ...timestamps, deletedAt: null };

    expect(expenseShareToRow(share).share_amount).toBe("5001");
    expect(rowToExpenseShare(expenseShareToRow(share))).toEqual(share);
    expect(settlementToRow(settlement).amount).toBe("5001");
    expect(rowToSettlement(settlementToRow(settlement))).toEqual(settlement);
  });
});
