"use client";

import { useEffect, useMemo, useState } from "react";

import { collaborationRepository } from "@/features/collaboration/data/dexie-collaboration-repository";
import type { Expense, ExpenseShare, TripMember } from "@/features/domain/entities";
import type { CurrencyCode, MinorUnits } from "@/features/domain/money";
import { expenseRepository } from "@/features/expenses/data/dexie-expense-repository";
import {
  buildSettlement,
  type SettlementTransfer,
} from "@/features/expenses/lib/settlement";

export interface SettlementData {
  /** True while expenses or their shares are still being loaded from Dexie. */
  loading: boolean;
  /** Net balance per traveler, in the trip base currency. Positive = owed, negative = owes. */
  balances: Record<string, MinorUnits>;
  /** Minimal optimal transfer plan to settle every balance. */
  transfers: SettlementTransfer[];
  /** Trip members whose balances are settled (used to resolve display names). */
  members: TripMember[];
}

/**
 * Feeds the settlement view entirely from the local-first Dexie layer:
 * expenses (via a live query) and their shares, plus the trip's members.
 * No network reads occur at render time, so the settlement is fully offline.
 */
export function useSettlement(
  tripId: string,
  baseCurrency: CurrencyCode
): SettlementData {
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [sharesByExpense, setSharesByExpense] = useState<Record<string, ExpenseShare[]>>({});
  const [sharesLoading, setSharesLoading] = useState(true);

  useEffect(() => expenseRepository.watchByTrip(tripId, setExpenses), [tripId]);
  useEffect(() => collaborationRepository.watchMembers(tripId, setMembers), [tripId]);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      (expenses ?? []).map(async (expense) => [expense.id, await expenseRepository.listSharesByExpense(expense.id)] as const)
    )
      .then((pairs) => {
        if (cancelled) return;
        setSharesByExpense(Object.fromEntries(pairs));
        setSharesLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setSharesByExpense({});
        setSharesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [expenses]);

  const { balances, transfers } = useMemo(() => {
    const items = (expenses ?? [])
      .filter((expense) => expense.deletedAt === null)
      .map((expense) => ({
        amountMinor: expense.amountMinor,
        currency: expense.currency,
        exchangeRateToBase: expense.exchangeRateToBase,
        paidBy: expense.paidBy,
        shares: (sharesByExpense[expense.id] ?? []).map((share) => ({
          userId: share.userId,
          shareAmountMinor: share.shareAmountMinor,
        })),
      }));
    return buildSettlement(items, baseCurrency);
  }, [expenses, sharesByExpense, baseCurrency]);

  return {
    loading: expenses === null || sharesLoading,
    balances,
    transfers,
    members,
  };
}
