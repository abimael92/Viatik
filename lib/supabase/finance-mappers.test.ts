import { describe, expect, it } from "vitest";

import type { Expense, ExpenseShare, UserWallet } from "@/features/domain/entities";
import { toBaseMinorUnits } from "@/features/domain/money";
import {
  expenseShareToRow,
  expenseToRow,
  rowToExpense,
  rowToExpenseShare,
  rowToUserWallet,
  userWalletToRow,
} from "@/lib/supabase/mappers";

const timestamps = {
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

describe("finance mappers", () => {
  it("round-trips a user wallet with minor-unit starting balance", () => {
    const wallet: UserWallet = {
      id: "wallet-1",
      tripId: "trip-1",
      userId: "user-1",
      startingBalanceMinor: 250000n,
      currency: "USD",
      version: 1,
      ...timestamps,
    };
    const row = userWalletToRow(wallet);
    expect(row.starting_balance).toBe("250000");
    expect(rowToUserWallet(row)).toEqual(wallet);
  });

  it("rejects out-of-range wallet starting balances", () => {
    const wallet: UserWallet = { id: "wallet-1", tripId: "trip-1", userId: "user-1", startingBalanceMinor: 10_000_000_000n, currency: "USD", version: 1, ...timestamps };
    expect(() => userWalletToRow(wallet)).toThrow("Invalid remote starting_balance");
  });

  it("round-trips an expense with finance metadata and a 'shares' split", () => {
    const expense: Expense = {
      id: "expense-1",
      tripId: "trip-1",
      activityId: null,
      description: "Dinner",
      amountMinor: 100000n,
      currency: "JPY",
      exchangeRateToBase: 0.0067,
      paidBy: "user-1",
      splitType: "shares",
      category: "food",
      subcategory: null,
      date: "2026-09-04",
      createdBy: "user-1",
      updatedBy: null,
      deletedBy: null,
      restoredAt: null,
      restoredBy: null,
      version: 1,
      createdAt: timestamps.createdAt,
      updatedAt: timestamps.updatedAt,
      deletedAt: null,
    };
    const row = expenseToRow(expense);
    expect(row.exchange_rate_to_base).toBe(0.0067);
    expect(row.category_id).toBe("food");
    expect(row.expense_date).toBe("2026-09-04");
    expect(row.split_type).toBe("shares");
    expect(rowToExpense(row)).toEqual(expense);
  });

  it("round-trips a share with a per-share split type", () => {
    const share: ExpenseShare = {
      id: "share-1",
      expenseId: "expense-1",
      paidBy: "",
      userId: "user-1",
      shareAmountMinor: 50000n,
      sharePercentage: null,
      splitType: "shares",
      settlementStatus: "pending",
      settledAt: null,
      settledBy: null,
      statusChangedAt: null,
      statusChangedBy: null,
      updatedBy: null,
      deletedBy: null,
      restoredAt: null,
      restoredBy: null,
      version: 1,
      ...timestamps,
    };
    const row = expenseShareToRow(share);
    expect(row.split_type).toBe("shares");
    expect(rowToExpenseShare(row)).toEqual(share);
  });

  it("falls back to the created date for expenses missing an expense_date", () => {
    const expense = rowToExpense({ id: "e1", trip_id: "t1", description: "x", amount: "100", currency: "USD", paid_by: "u1", created_at: "2026-09-05T10:00:00.000Z", updated_at: "2026-09-05T10:00:00.000Z" });
    expect(expense.date).toBe("2026-09-05");
    expect(expense.exchangeRateToBase).toBeNull();
    expect(expense.category).toBeNull();
  });

  it("converts foreign minor units to base minor units via exchange rate", () => {
    // 10000 JPY (exponent 0) * 0.0067 USD/JPY = 67.00 USD = 6700 USD minor
    expect(toBaseMinorUnits(10000n, "JPY", 0.0067, "USD")).toBe(6700n);
    // 10000 USD minor (100.00 USD) * 1 = 10000 USD minor
    expect(toBaseMinorUnits(10000n, "USD", 1, "USD")).toBe(10000n);
    expect(() => toBaseMinorUnits(10000n, "USD", -1, "USD")).toThrow("Invalid exchange rate");
  });
});
