"use client";

import { useEffect, useMemo, useState } from "react";

import { SPENDING_CATEGORY_KEYS, type SpendingCategory } from "@/features/domain/categories";
import type { Expense, TripBudget } from "@/features/domain/entities";
import type { MinorUnits } from "@/features/domain/money";
import { expenseRepository } from "@/features/expenses/data/dexie-expense-repository";
import { tripBudgetRepository } from "@/features/finance/data/dexie-finance-repository";
import {
  getCategoryTotalSpent,
  getGroupTotalSpent,
  type AggregateExpense,
} from "@/features/finance/lib/finance-aggregators";

export interface TripSpending {
  /** True until the first expense read has resolved. */
  loading: boolean;
  expenses: Expense[];
  budget: TripBudget | undefined;
  /** Total spent across all expenses, converted to the base currency. */
  totalSpent: MinorUnits;
  /** Spent per spending category, converted to the base currency. */
  categoryTotals: Map<SpendingCategory, MinorUnits>;
  /** Category → allocated cap from the trip budget. */
  allocations: Map<SpendingCategory, MinorUnits>;
}

/**
 * Live, offline-first spending snapshot for a trip. Subscribes to expenses and
 * the unified trip budget via Dexie `liveQuery`, so every derived total
 * (group total, per-category envelopes, allocation caps) updates reactively.
 */
export function useTripSpending(tripId: string, baseCurrency: string): TripSpending {
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [budget, setBudget] = useState<TripBudget | undefined>(undefined);

  useEffect(() => expenseRepository.watchByTrip(tripId, setExpenses), [tripId]);
  useEffect(() => tripBudgetRepository.watchByTrip(tripId, setBudget), [tripId]);

  const aggregate: AggregateExpense[] = useMemo(
    () =>
      (expenses ?? [])
        .filter((expense) => expense.deletedAt === null)
        .map((expense) => ({
          amountMinor: expense.amountMinor,
          currency: expense.currency,
          exchangeRateToBase: expense.exchangeRateToBase,
          paidBy: expense.paidBy,
          date: expense.date,
          category: expense.category,
          shares: [],
        })),
    [expenses]
  );

  const totalSpent = useMemo(() => getGroupTotalSpent(aggregate, baseCurrency), [aggregate, baseCurrency]);

  const categoryTotals = useMemo(() => {
    const map = new Map<SpendingCategory, MinorUnits>();
    for (const category of SPENDING_CATEGORY_KEYS) {
      map.set(category, getCategoryTotalSpent(aggregate, category, baseCurrency));
    }
    return map;
  }, [aggregate, baseCurrency]);

  const allocations = useMemo(
    () => new Map((budget?.categoryAllocations ?? []).map((allocation) => [allocation.category, allocation.allocationMinor])),
    [budget]
  );

  return {
    loading: expenses === null,
    expenses: expenses ?? [],
    budget,
    totalSpent,
    categoryTotals,
    allocations,
  };
}
