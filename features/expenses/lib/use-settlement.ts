"use client";

import { useTripBalances, type TripBalances } from "@/features/expenses/lib/use-trip-balances";
import type { CurrencyCode } from "@/features/domain/money";

export type SettlementData = Pick<TripBalances, "loading" | "balances" | "transfers" | "members">;

/** Compatible wrapper around the ledger selector used by the Finance overview. */
export function useSettlement(tripId: string, baseCurrency: CurrencyCode): SettlementData {
  const { loading, balances, transfers, members } = useTripBalances(tripId, baseCurrency);
  return { loading, balances, transfers, members };
}
