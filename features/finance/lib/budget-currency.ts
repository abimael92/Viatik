import type { MinorUnits } from "@/features/domain/money";
import {
  SUPPORTED_CURRENCIES,
  convertMinorUnits,
  lookupRate,
  minorExponent,
} from "@/features/finance/lib/currency-converter";

/**
 * Helpers for entering a trip budget in the user's preferred currency while
 * storing it in the trip's base currency. All amounts are integer minor units.
 */

/** The currency used to edit a budget: the user's preferred currency when it's
 * a supported code, otherwise the trip's base currency. */
export function budgetUserCurrency(preferred: string | null | undefined, baseCurrency: string): string {
  if (preferred && (SUPPORTED_CURRENCIES as readonly string[]).includes(preferred)) return preferred;
  return baseCurrency;
}

/** Convert a minor-units amount between currencies using the offline default rate. */
export function convertBudget(minor: MinorUnits, from: string, to: string): MinorUnits {
  if (from === to) return minor;
  try {
    return convertMinorUnits(minor, from, lookupRate(from, to), to);
  } catch {
    return minor;
  }
}

/** Minor units → plain decimal string (for populating a numeric input). */
export function minorToInput(minor: MinorUnits, currency: string): string {
  const exp = minorExponent(currency);
  const whole = minor / 10n ** BigInt(exp);
  const frac = minor % 10n ** BigInt(exp);
  return exp === 0 ? String(whole) : `${whole}.${String(frac).padStart(exp, "0")}`;
}

/**
 * Recommended daily pace for a trip budget, leaving an unallocated buffer so
 * there's money left over at the end. Defaults to a 10% buffer of the total.
 */
export function recommendedDailyBudget(totalBudget: MinorUnits, dayCount: number, bufferPercent = 10): MinorUnits {
  if (dayCount <= 0) return 0n;
  const keep = 100n - BigInt(Math.max(0, Math.min(100, bufferPercent)));
  return (totalBudget * keep) / (BigInt(dayCount) * 100n);
}
