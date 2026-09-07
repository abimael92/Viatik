import type { SpendingCategory } from "@/features/domain/categories";
import type { MinorUnits } from "@/features/domain/money";
import { toBaseMinorUnits } from "@/features/domain/money";

/**
 * Pure aggregation functions for the finance dashboard. They accept plain
 * Dexie-shaped data (never a repository or the DB) so they are trivially
 * testable and currency conversion is centralized here.
 *
 * All group/personal totals are normalized to the trip's base currency in
 * minor units. Wallet amounts are assumed to already be in the base currency.
 */

/** Minimal shape of an expense the aggregators operate on. */
export interface AggregateExpense {
  amountMinor: MinorUnits;
  currency: string;
  exchangeRateToBase: number | null;
  paidBy: string;
  date: string; // ISO date (yyyy-mm-dd)
  /** Optional spending category used for envelope totals. */
  category?: SpendingCategory | null;
  shares: Array<{ userId: string; shareAmountMinor: MinorUnits }>;
}

/** Minimal shape of an itinerary activity the aggregators operate on. */
export interface AggregateActivity {
  dayDate: string; // ISO date (yyyy-mm-dd)
  estimatedCostMinor: MinorUnits | null;
}

/** A user's private starting balance for the trip. */
export interface AggregateWallet {
  startingBalanceMinor: MinorUnits;
  currency: string;
}

/** Per-day budget override (in the trip's base currency, minor units). */
export interface AggregateDailyOverride {
  customBudgetAmountMinor: MinorUnits;
}

export interface DailyPacing {
  date: string;
  currency: string;
  spent: MinorUnits;
  budget: MinorUnits;
  remaining: MinorUnits;
  status: "under" | "over" | "at";
}

/**
 * Converts an amount to the base currency. When an exchange rate is absent the
 * amount is only usable if it is already in the base currency; otherwise the
 * expense is treated as unconvertible and returns `null` (excluded from totals).
 */
function toBase(
  amountMinor: MinorUnits,
  currency: string,
  exchangeRateToBase: number | null,
  baseCurrency: string
): MinorUnits | null {
  if (exchangeRateToBase == null) {
    return currency === baseCurrency ? amountMinor : null;
  }
  return toBaseMinorUnits(amountMinor, currency, exchangeRateToBase, baseCurrency);
}

/** Total of all settled expenses, converted to the trip's base currency. */
export function getGroupTotalSpent(expenses: AggregateExpense[], baseCurrency: string): MinorUnits {
  return expenses.reduce(
    (sum, expense) => sum + (toBase(expense.amountMinor, expense.currency, expense.exchangeRateToBase, baseCurrency) ?? 0n),
    0n
  );
}

/**
 * Total spent within a single spending category, converted to the trip's base
 * currency. Only expenses tagged with `category` count; unconvertible foreign
 * expenses are excluded (same guard as `getGroupTotalSpent`).
 */
export function getCategoryTotalSpent(
  expenses: AggregateExpense[],
  category: SpendingCategory,
  baseCurrency: string
): MinorUnits {
  return expenses.reduce(
    (sum, expense) =>
      expense.category === category
        ? sum + (toBase(expense.amountMinor, expense.currency, expense.exchangeRateToBase, baseCurrency) ?? 0n)
        : sum,
    0n
  );
}

/**
 * Budget usage ratio (`spent ÷ total`), or `null` when there is no budget to
 * measure against. A value below 1.0 is under budget; 1.0 is exactly at; above
 * 1.0 means the budget has been exceeded.
 */
export function getBudgetUsage(spent: MinorUnits, totalBudget: MinorUnits): number | null {
  if (totalBudget <= 0n) return null;
  return Number(spent) / Number(totalBudget);
}

/** A specific user's share of settled expenses, converted to the base currency. */
export function getPersonalTotalSpent(expenses: AggregateExpense[], userId: string, baseCurrency: string): MinorUnits {
  return expenses.reduce((sum, expense) => {
    const share = expense.shares.find((s) => s.userId === userId)?.shareAmountMinor;
    if (share == null) return sum;
    return sum + (toBase(share, expense.currency, expense.exchangeRateToBase, baseCurrency) ?? 0n);
  }, 0n);
}

/** `startingBalanceMinor` minus personal spent, in the base currency. */
export function getPersonalLeftover(wallet: AggregateWallet, personalSpentBase: MinorUnits): MinorUnits {
  return wallet.startingBalanceMinor - personalSpentBase;
}

/**
 * Group planned liability: the sum of estimated costs for upcoming itinerary
 * activities (on or after `todayISO`), in the base currency.
 */
export function getPlannedTotal(activities: AggregateActivity[], todayISO: string): MinorUnits {
  return activities
    .filter((activity) => activity.dayDate >= todayISO && activity.estimatedCostMinor != null)
    .reduce((sum, activity) => sum + (activity.estimatedCostMinor as MinorUnits), 0n);
}

/**
 * A member's equal-share of the group planned liability. Uses a floored equal
 * split across `memberCount` members (the remainder is conservatively dropped
 * so we never over-subtract from the wallet).
 */
export function getPersonalPlanned(activities: AggregateActivity[], todayISO: string, memberCount: number): MinorUnits {
  const planned = getPlannedTotal(activities, todayISO);
  if (memberCount <= 1) return planned;
  return planned / BigInt(memberCount);
}

/**
 * True leftover: private wallet minus both settled actuals and upcoming planned
 * estimates. This is the honest "how much can I still spend" figure.
 */
export function getTrueLeftover(
  wallet: AggregateWallet,
  personalSpentBase: MinorUnits,
  personalPlanned: MinorUnits
): MinorUnits {
  return wallet.startingBalanceMinor - personalSpentBase - personalPlanned;
}

/**
 * Daily pacing for a single date: how much was spent that day against the day's
 * budget. The day's budget is `dailyOverride` when present, else the derived
 * `dayBudget` (total trip budget ÷ trip days).
 */
export function getDailyPacing(
  date: string,
  expenses: AggregateExpense[],
  dayBudget: MinorUnits,
  dailyOverride: AggregateDailyOverride | null | undefined,
  baseCurrency: string
): DailyPacing {
  const spent = expenses
    .filter((expense) => expense.date === date)
    .reduce((sum, expense) => sum + (toBase(expense.amountMinor, expense.currency, expense.exchangeRateToBase, baseCurrency) ?? 0n), 0n);
  const budget = dailyOverride?.customBudgetAmountMinor ?? dayBudget;
  const remaining = budget - spent;
  const status: DailyPacing["status"] = remaining < 0n ? "over" : remaining > 0n ? "under" : "at";
  return { date, currency: baseCurrency, spent, budget, remaining, status };
}
