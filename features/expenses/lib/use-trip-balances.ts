"use client";

import { useEffect, useMemo, useState } from "react";

import { collaborationRepository } from "@/features/collaboration/data/dexie-collaboration-repository";
import type { Expense, ExpenseSettlement, ExpenseShare, TripMember } from "@/features/domain/entities";
import type { CurrencyCode, MinorUnits } from "@/features/domain/money";
import { expenseRepository } from "@/features/expenses/data/dexie-expense-repository";
import { settlementRepository } from "@/features/expenses/data/dexie-settlement-repository";
import type { SettlementTransfer } from "@/features/expenses/lib/settlement";
import { buildTripBalances, type PairwiseDebt } from "@/features/expenses/lib/trip-balances";

export interface TripBalances {
  loading: boolean;
  balances: Record<string, MinorUnits>;
  pairwiseDebts: PairwiseDebt[];
  transfers: SettlementTransfer[];
  members: TripMember[];
  settlements: ExpenseSettlement[];
}

export function useTripBalances(tripId: string, baseCurrency: CurrencyCode): TripBalances {
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [settlements, setSettlements] = useState<ExpenseSettlement[] | null>(null);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [sharesByExpense, setSharesByExpense] = useState<Record<string, ExpenseShare[]>>({});
  const [sharesLoading, setSharesLoading] = useState(true);

  useEffect(() => expenseRepository.watchByTrip(tripId, setExpenses), [tripId]);
  useEffect(() => settlementRepository.watchByTrip(tripId, setSettlements), [tripId]);
  useEffect(() => collaborationRepository.watchMembers(tripId, setMembers), [tripId]);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      (expenses ?? []).map(async (expense) => [expense.id, await expenseRepository.listSharesByExpense(expense.id)] as const),
    )
      .then((pairs) => {
        if (cancelled) return;
        setSharesByExpense(Object.fromEntries(pairs));
        setSharesLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setSharesByExpense({});
          setSharesLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [expenses]);

  const ledger = useMemo(() => {
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
    return buildTripBalances(items, settlements ?? [], baseCurrency);
  }, [expenses, settlements, sharesByExpense, baseCurrency]);

  return {
    loading: expenses === null || settlements === null || sharesLoading,
    balances: ledger.balances,
    pairwiseDebts: ledger.pairwiseDebts,
    transfers: ledger.transfers,
    members,
    settlements: settlements ?? [],
  };
}
