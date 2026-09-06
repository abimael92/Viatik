import type { CurrencyCode, MinorUnits } from "@/features/domain/money";
import { toBaseMinorUnits } from "@/features/domain/money";

/**
 * Settlement engine for trip expenses.
 *
 * All money is handled in minor currency units (e.g. cents) as integers to
 * avoid floating-point drift. Each expense is first normalized into the trip's
 * base currency (via its `exchangeRateToBase` when present), the per-traveler
 * net balance is derived, and then a greedy debt-simplification pass collapses
 * the creditor/debtor graph into the minimal set of cash transfers required to
 * settle everyone.
 *
 * The module is intentionally pure: it accepts plain, Dexie-shaped data and
 * never touches a repository, the database, or React, so it is trivially
 * testable and fully offline.
 */

/** Minimal shape of a settled expense the engine operates on. */
export interface SettlementExpense {
  amountMinor: MinorUnits;
  currency: CurrencyCode;
  /** Multiplier converting 1 unit of this expense's currency to the trip base currency. */
  exchangeRateToBase: number | null;
  /** The user who paid the full `amountMinor`. */
  paidBy: string;
  /** Who owes a portion of this expense, and how much (in the expense's currency). */
  shares: Array<{ userId: string; shareAmountMinor: MinorUnits }>;
}

/** A single recommended cash transfer that settles a portion of a balance. */
export interface SettlementTransfer {
  fromUserId: string;
  toUserId: string;
  amountMinor: MinorUnits;
  /** Always the trip's base currency — every transfer is expressed in it. */
  currency: CurrencyCode;
}

export interface Settlement {
  /** Net balance per user, in the trip base currency. Positive = is owed (receives), negative = owes. */
  balances: Record<string, MinorUnits>;
  /** Minimal set of transfers that settle every non-zero balance. */
  transfers: SettlementTransfer[];
  baseCurrency: CurrencyCode;
}

/**
 * Converts a minor-units amount into the trip's base currency. Mirrors the
 * finance aggregators: when no exchange rate is provided the amount is only
 * usable if it is already in the base currency; otherwise it returns `null`
 * (an un-convertible foreign expense) and is excluded from settlement.
 */
function toBase(
  amountMinor: MinorUnits,
  currency: CurrencyCode,
  exchangeRateToBase: number | null,
  baseCurrency: CurrencyCode
): MinorUnits | null {
  if (exchangeRateToBase == null) {
    return currency === baseCurrency ? amountMinor : null;
  }
  return toBaseMinorUnits(amountMinor, currency, exchangeRateToBase, baseCurrency);
}

/**
 * Computes the net balance for every traveler, normalized into the trip's base
 * currency. A payer receives credit for what they covered; each participant
 * is debited for their share.
 *
 * A positive balance means the traveler is owed money (a creditor); a negative
 * balance means they owe the group (a debtor). Un-convertible foreign expenses
 * (no exchange rate, different currency) are skipped so they never corrupt the
 * settled totals.
 */
export function calculateNetBalances(
  expenses: SettlementExpense[],
  baseCurrency: CurrencyCode
): Record<string, MinorUnits> {
  const balances: Record<string, MinorUnits> = {};

  for (const expense of expenses) {
    const amountBase = toBase(expense.amountMinor, expense.currency, expense.exchangeRateToBase, baseCurrency);
    if (amountBase == null) continue;

    balances[expense.paidBy] = (balances[expense.paidBy] ?? 0n) + amountBase;
    for (const share of expense.shares) {
      const shareBase = toBase(share.shareAmountMinor, expense.currency, expense.exchangeRateToBase, baseCurrency);
      // All shares of one expense share its currency/rate, so this mirrors the
      // amount guard above, but keeping it local is safe against bad data.
      if (shareBase == null) continue;
      balances[share.userId] = (balances[share.userId] ?? 0n) - shareBase;
    }
  }

  return balances;
}

/**
 * Greedy debt-simplification. Repeatedly matches the largest creditor (most
 * owed) with the largest debtor (owes the most), transferring the minimum of
 * the two. Each round fully settles at least one party, so the result uses at
 * most `n - 1` transfers for `n` non-zero balances — the theoretical minimum
 * number of transfers — and ties are broken deterministically.
 */
export function simplifyTransfers(
  balances: Record<string, MinorUnits>,
  currency: CurrencyCode
): SettlementTransfer[] {
  const creditors = new Map<string, MinorUnits>();
  const debtors = new Map<string, MinorUnits>();

  for (const [userId, balance] of Object.entries(balances)) {
    if (balance > 0n) creditors.set(userId, balance);
    else if (balance < 0n) debtors.set(userId, balance);
  }

  const transfers: SettlementTransfer[] = [];

  while (creditors.size > 0 && debtors.size > 0) {
    const creditor = largestEntry(creditors);
    const debtor = largestEntry(debtors);
    if (!creditor || !debtor) break;

    // `creditor.value` is positive (owed); `debtor.value` is negative (owes).
    const creditorOwed = creditor.value;
    const debtorOwes = -debtor.value;
    const settled = creditorOwed < debtorOwes ? creditorOwed : debtorOwes;
    if (settled <= 0n) break;

    transfers.push({ fromUserId: debtor.key, toUserId: creditor.key, amountMinor: settled, currency });

    const creditorRemaining = creditors.get(creditor.key)! - settled;
    const debtorRemaining = debtors.get(debtor.key)! + settled;
    if (creditorRemaining <= 0n) creditors.delete(creditor.key);
    else creditors.set(creditor.key, creditorRemaining);
    if (debtorRemaining >= 0n) debtors.delete(debtor.key);
    else debtors.set(debtor.key, debtorRemaining);
  }

  return transfers;
}

/** Returns the entry with the largest absolute value (used for both sides). */
function largestEntry(map: Map<string, MinorUnits>): { key: string; value: MinorUnits } | null {
  let best: { key: string; value: MinorUnits } | null = null;
  for (const [key, value] of map) {
    const magnitude = value < 0n ? -value : value;
    if (!best || magnitude > (best.value < 0n ? -best.value : best.value)) {
      best = { key, value };
    }
  }
  return best;
}

/**
 * One-stop helper: derives net balances from expenses and collapses them into
 * an optimal transfer plan in a single call.
 */
export function buildSettlement(
  expenses: SettlementExpense[],
  baseCurrency: CurrencyCode
): Settlement {
  const balances = calculateNetBalances(expenses, baseCurrency);
  return {
    balances,
    transfers: simplifyTransfers(balances, baseCurrency),
    baseCurrency,
  };
}
