import {
  addDays,
  addMonths,
  addWeeks,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  format,
  isValid,
  parseISO,
  startOfDay,
} from "date-fns";

import { SHORT_HAUL_BOOKING_WINDOW_DAYS } from "@/features/trip-planner/domain/flight-booking-window";
import type {
  SavingsSuggestion,
  SavingsSuggestionInput,
} from "@/features/trip-planner/domain/trip-planner-types";

function ceilDivide(amount: bigint, divisor: bigint): bigint {
  return amount === 0n ? 0n : (amount + divisor - 1n) / divisor;
}

function isoDate(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/**
 * When flights should be bought: the booking window before departure, never in
 * the past. A past date means "the window is already open".
 */
function bookByDate(start: Date, today: Date, bookingWindowDays: number): string {
  const target = addDays(start, -bookingWindowDays);
  return isoDate(target < today ? today : target);
}

export function calculateSavingsSuggestion({
  tripStartDate,
  targetTripCostMinor,
  currentSavingsMinor,
  cadence,
  bookingWindowDays = SHORT_HAUL_BOOKING_WINDOW_DAYS,
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
  const todayStart = startOfDay(today);
  const remaining =
    targetTripCostMinor! > currentSavingsMinor ? targetTripCostMinor! - currentSavingsMinor : 0n;
  const remainingDays = differenceInCalendarDays(start, todayStart);
  const bookBy = bookByDate(start, todayStart, bookingWindowDays);

  if (remainingDays <= 0) {
    return { status: "due-now", amountMinor: remaining, readyOn: isoDate(todayStart), bookBy };
  }

  if (remainingDays >= 30) {
    const periods = Math.max(1, differenceInCalendarMonths(start, todayStart));
    return {
      status: "scheduled",
      cadence: "monthly",
      periods,
      contributionMinor: ceilDivide(remaining, BigInt(periods)),
      readyOn: isoDate(addMonths(todayStart, periods)),
      bookBy,
    };
  }

  const effectiveCadence = cadence === "once" ? "once" : "weekly";
  const periods = effectiveCadence === "once" ? 1 : Math.max(1, Math.ceil(remainingDays / 7));
  return {
    status: "scheduled",
    cadence: effectiveCadence,
    periods,
    contributionMinor: ceilDivide(remaining, BigInt(periods)),
    readyOn:
      effectiveCadence === "once"
        ? isoDate(todayStart)
        : isoDate(addWeeks(todayStart, periods)),
    bookBy,
  };
}
