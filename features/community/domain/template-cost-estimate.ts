import { getCurrencyExponent, type MinorUnits } from "@/features/domain/money";
import { convertBudget } from "@/features/finance/lib/budget-currency";

/** Saving windows a community card compares, in months. */
export const TEMPLATE_SAVINGS_HORIZONS = [3, 5] as const;

export type TemplateCostInput = {
  /** Trip length in days; nights are `days - 1`. */
  days: number;
  travelers: number;
  /** Currency the baselines below are expressed in. */
  baseCurrency: string;
  /** Round-trip fare per traveler, whole units of `baseCurrency`. */
  flightPerPerson: number;
  /** Meals, local transport and activities per traveler per day, whole units. */
  dailyPerPerson: number;
  /** One room or rental per night for the whole party, whole units. */
  hotelPerNight: number;
  /** Currency the traveler wants the estimate in. */
  currency: string;
};

export type TemplateCostEstimate = {
  /** All-in cost for the whole party, integer minor units of `currency`. */
  totalMinor: MinorUnits;
  perTravelerMinor: MinorUnits;
  travelers: number;
  currency: string;
  /** What each saving window costs per month, integer minor units. */
  monthly: Array<{ months: number; amountMinor: MinorUnits }>;
};

function ceilDivide(amount: bigint, divisor: bigint): bigint {
  return amount === 0n ? 0n : (amount + divisor - 1n) / divisor;
}

function exponentOrNull(currency: string): number | null {
  try {
    return getCurrencyExponent(currency);
  } catch {
    return null;
  }
}

/**
 * All-in cost of running a community template, priced from its own baselines.
 *
 * Flight and daily baselines are per traveler; the nightly rate covers the
 * whole party, exactly like a Scout idea. The result is converted into the
 * traveler's currency with the offline default rates, so the card renders with
 * no network round-trip. Returns `null` when either currency is outside the
 * money domain, so the card omits the figure instead of mislabelling it.
 */
export function templateCostEstimate(input: TemplateCostInput): TemplateCostEstimate | null {
  const { days, travelers, baseCurrency, currency } = input;
  if (!Number.isInteger(days) || days < 1) throw new RangeError("A trip needs at least one day.");
  if (!Number.isInteger(travelers) || travelers < 1) {
    throw new RangeError("At least one traveler is required.");
  }

  const baseExponent = exponentOrNull(baseCurrency);
  const displayExponent = exponentOrNull(currency);
  if (baseExponent === null || displayExponent === null) return null;

  const party = BigInt(travelers);
  const nights = BigInt(Math.max(1, days - 1));
  const totalBase =
    (BigInt(input.flightPerPerson) * party +
      BigInt(input.dailyPerPerson) * BigInt(days) * party +
      BigInt(input.hotelPerNight) * nights) *
    10n ** BigInt(baseExponent);

  const totalMinor = convertBudget(totalBase, baseCurrency, currency);

  return {
    totalMinor,
    perTravelerMinor: ceilDivide(totalMinor, party),
    travelers,
    currency: currency.toUpperCase(),
    monthly: TEMPLATE_SAVINGS_HORIZONS.map((months) => ({
      months,
      amountMinor: ceilDivide(totalMinor, BigInt(months)),
    })),
  };
}
