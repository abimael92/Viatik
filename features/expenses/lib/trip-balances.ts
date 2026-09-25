import type { CurrencyCode, MinorUnits } from "@/features/domain/money";
import { toBaseMinorUnits } from "@/features/domain/money";
import {
  calculateNetBalances,
  simplifyTransfers,
  type SettlementExpense,
  type SettlementTransfer,
} from "@/features/expenses/lib/settlement";

export type LedgerSettlement = {
  fromUserId: string;
  toUserId: string;
  amountMinor: MinorUnits;
  currency: CurrencyCode;
  deletedAt?: string | null;
};

/** Pairwise remaining debt: `payerId` owes `receiverId`. */
export type PairwiseDebt = {
  payerId: string;
  receiverId: string;
  amountMinor: MinorUnits;
  currency: CurrencyCode;
};

function toBase(
  amountMinor: MinorUnits,
  currency: CurrencyCode,
  exchangeRateToBase: number | null,
  baseCurrency: CurrencyCode,
): MinorUnits | null {
  if (exchangeRateToBase == null) {
    return currency === baseCurrency ? amountMinor : null;
  }
  return toBaseMinorUnits(amountMinor, currency, exchangeRateToBase, baseCurrency);
}

function pairKey(from: string, to: string): string {
  return `${from}\u0000${to}`;
}

function addDirected(map: Map<string, MinorUnits>, from: string, to: string, amount: MinorUnits): void {
  if (!from || !to || from === to || amount === 0n) return;
  const key = pairKey(from, to);
  map.set(key, (map.get(key) ?? 0n) + amount);
}

function directed(map: Map<string, MinorUnits>, from: string, to: string): MinorUnits {
  return map.get(pairKey(from, to)) ?? 0n;
}

/** Apply immutable repayments to group nets. Payer debt shrinks; receiver credit shrinks. */
export function applySettlementsToBalances(
  balances: Record<string, MinorUnits>,
  settlements: readonly LedgerSettlement[],
  baseCurrency: CurrencyCode,
): Record<string, MinorUnits> {
  const next = { ...balances };
  for (const settlement of settlements) {
    if (settlement.deletedAt) continue;
    const amount = toBase(settlement.amountMinor, settlement.currency, null, baseCurrency);
    if (amount == null || amount <= 0n) continue;
    next[settlement.fromUserId] = (next[settlement.fromUserId] ?? 0n) + amount;
    next[settlement.toUserId] = (next[settlement.toUserId] ?? 0n) - amount;
  }
  return next;
}

/**
 * Expense-share debts minus settlements, then netted both directions so each
 * pair appears once (“Aby owes Traveler B $40”).
 */
export function calculatePairwiseDebts(
  expenses: readonly SettlementExpense[],
  settlements: readonly LedgerSettlement[],
  baseCurrency: CurrencyCode,
): PairwiseDebt[] {
  const debt = new Map<string, MinorUnits>();
  const paid = new Map<string, MinorUnits>();

  for (const expense of expenses) {
    for (const share of expense.shares) {
      if (share.userId === expense.paidBy) continue;
      const amount = toBase(
        share.shareAmountMinor,
        expense.currency,
        expense.exchangeRateToBase,
        baseCurrency,
      );
      if (amount == null || amount <= 0n) continue;
      addDirected(debt, share.userId, expense.paidBy, amount);
    }
  }

  for (const settlement of settlements) {
    if (settlement.deletedAt) continue;
    const amount = toBase(settlement.amountMinor, settlement.currency, null, baseCurrency);
    if (amount == null || amount <= 0n) continue;
    addDirected(paid, settlement.fromUserId, settlement.toUserId, amount);
  }

  const people = new Set<string>();
  for (const key of [...debt.keys(), ...paid.keys()]) {
    const [from, to] = key.split("\u0000");
    if (from) people.add(from);
    if (to) people.add(to);
  }

  const debts: PairwiseDebt[] = [];
  const seen = new Set<string>();
  for (const a of people) {
    for (const b of people) {
      if (a >= b) continue;
      const rawAb = directed(debt, a, b) - directed(paid, a, b);
      const rawBa = directed(debt, b, a) - directed(paid, b, a);
      const net = rawAb - rawBa;
      if (net === 0n) continue;
      const pair = net > 0n ? { payerId: a, receiverId: b, amountMinor: net } : { payerId: b, receiverId: a, amountMinor: -net };
      const key = pairKey(pair.payerId, pair.receiverId);
      if (seen.has(key)) continue;
      seen.add(key);
      debts.push({ ...pair, currency: baseCurrency });
    }
  }

  return debts.sort((left, right) => {
    const amount = Number(right.amountMinor - left.amountMinor);
    return amount !== 0 ? amount : left.payerId.localeCompare(right.payerId);
  });
}

export function buildTripBalances(
  expenses: readonly SettlementExpense[],
  settlements: readonly LedgerSettlement[],
  baseCurrency: CurrencyCode,
): {
  balances: Record<string, MinorUnits>;
  pairwiseDebts: PairwiseDebt[];
  transfers: SettlementTransfer[];
} {
  const balances = applySettlementsToBalances(
    calculateNetBalances([...expenses], baseCurrency),
    settlements,
    baseCurrency,
  );
  return {
    balances,
    pairwiseDebts: calculatePairwiseDebts(expenses, settlements, baseCurrency),
    transfers: simplifyTransfers(balances, baseCurrency),
  };
}
