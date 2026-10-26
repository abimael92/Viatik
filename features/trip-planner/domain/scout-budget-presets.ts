import { getCurrencyExponent } from "@/features/domain/money";
import type { ScoutTripIdeasInput } from "@/features/trip-planner/domain/scout-trip-ideas-schema";

/**
 * One-tap savings presets, expressed in whole units of each supported planner
 * currency so the pills read as round local amounts instead of USD converted
 * by a live (and offline-unavailable) exchange rate.
 */
const PRESET_WHOLE_UNITS: Record<ScoutTripIdeasInput["currency"], readonly number[]> = {
  USD: [100, 250, 500],
  EUR: [100, 250, 500],
  GBP: [80, 200, 400],
  CAD: [135, 340, 675],
  MXN: [1_800, 4_500, 9_000],
  JPY: [15_000, 37_500, 75_000],
};

/**
 * Preset savings amounts in minor units for the traveler's currency. Returns
 * an empty list for a currency Scout does not plan in, so the wizard simply
 * omits the pills instead of failing.
 */
export function scoutBudgetPresets(currency: string): bigint[] {
  const code = currency.toUpperCase() as ScoutTripIdeasInput["currency"];
  const wholeUnits = PRESET_WHOLE_UNITS[code];
  if (!wholeUnits) return [];
  const scale = 10n ** BigInt(getCurrencyExponent(code));
  return wholeUnits.map((amount) => BigInt(amount) * scale);
}
