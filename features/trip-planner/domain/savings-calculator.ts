import { differenceInCalendarDays, differenceInCalendarMonths, isValid, parseISO } from "date-fns";

import type {
  SavingsSuggestion,
  SavingsSuggestionInput,
} from "@/features/trip-planner/domain/trip-planner-types";

function ceilDivide(amount: bigint, divisor: bigint): bigint {
  return amount === 0n ? 0n : (amount + divisor - 1n) / divisor;
}

export function calculateSavingsSuggestion({
  tripStartDate,
  targetTripCostMinor,
  currentSavingsMinor,
  cadence,
  today = new Date(),
}: SavingsSuggestionInput): SavingsSuggestion {
  if (currentSavingsMinor < 0n || (targetTripCostMinor !== null && targetTripCostMinor < 0n)) {
    throw new RangeError("Savings amounts must be non-negative.");
  }

  const missing: Array<"tripStartDate" | "targetTripCostMinor"> = [];
  if (!tripStartDate || !isValid(parseISO(tripStartDate))) missing.push("tripStartDate");
  if (targetTripCostMinor === null) missing.push("targetTripCostMinor");
  if (missing.length) return { status: "missing-input", missing };

  const start = parseISO(tripStartDate!);
  const remaining =
    targetTripCostMinor! > currentSavingsMinor ? targetTripCostMinor! - currentSavingsMinor : 0n;
  const remainingDays = differenceInCalendarDays(start, today);

  if (remainingDays <= 0) return { status: "due-now", amountMinor: remaining };

  if (remainingDays >= 30) {
    const periods = Math.max(1, differenceInCalendarMonths(start, today));
    return {
      status: "scheduled",
      cadence: "monthly",
      periods,
      contributionMinor: ceilDivide(remaining, BigInt(periods)),
    };
  }

  const effectiveCadence = cadence === "once" ? "once" : "weekly";
  const periods = effectiveCadence === "once" ? 1 : Math.max(1, Math.ceil(remainingDays / 7));
  return {
    status: "scheduled",
    cadence: effectiveCadence,
    periods,
    contributionMinor: ceilDivide(remaining, BigInt(periods)),
  };
}
