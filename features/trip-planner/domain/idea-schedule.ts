import {
  addDays,
  addMonths,
  addWeeks,
  differenceInCalendarDays,
  differenceInMonths,
  differenceInWeeks,
  format,
  isBefore,
  isValid,
  parseISO,
  startOfDay,
} from "date-fns";

import type { MinorUnits } from "@/features/domain/money";
import { flightBookingWindowDays } from "@/features/trip-planner/domain/flight-booking-window";
import { calculateSavingsSuggestion } from "@/features/trip-planner/domain/savings-calculator";
import type {
  IdeaSavingsCadence,
  SavingsCadence,
} from "@/features/trip-planner/domain/trip-planner-types";
import { MAX_TRAVEL_WINDOW_DAYS } from "@/features/trip-planner/domain/travel-window";

/** Upper bound on displayed savings periods so dates stay representable. */
const MAX_SAVINGS_PERIODS = 1200;
const DEFAULT_TRIP_DAYS = 5;

export type IdeaSchedule = {
  /** True when the traveler gave Scout a savings pace to work from. */
  hasPace: boolean;
  contributionMinor: MinorUnits;
  cadence: SavingsCadence;
  periods: number;
  /** ISO date the goal is reached. */
  readyOn: string;
  /** ISO date flights should be bought by, never in the past. */
  bookBy: string;
  /** ISO date of the first travel day. */
  departureStart: string;
  /** ISO date of the last travel day, inclusive. */
  departureEnd: string;
  days: number;
  /** Positive when the pace cannot cover a pinned departure. */
  shortfallMinor: MinorUnits | null;
  /** True when the departure was derived from the pace, not pinned. */
  isEstimate: boolean;
};

function isoDate(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function ceilDivide(amount: bigint, divisor: bigint): bigint {
  return amount === 0n ? 0n : (amount + divisor - 1n) / divisor;
}

function monthStart(targetMonth: string | null): Date | null {
  if (!targetMonth || !/^\d{4}-(0[1-9]|1[0-2])$/.test(targetMonth)) return null;
  return new Date(Number(targetMonth.slice(0, 4)), Number(targetMonth.slice(5, 7)) - 1, 1);
}

/**
 * Rebuilds the plan Scout showed in the wizard from the answers saved on the
 * idea: savings pace, timing, target month, dates and trip length. Returns null
 * when there is not enough context to be honest about dates.
 */
export function buildIdeaSchedule({
  targetTripCostMinor,
  currentSavingsMinor = 0n,
  savingsCapacityMinor,
  savingsCadence,
  preferredCadence,
  targetMonth,
  startDate,
  endDate,
  durationDays,
  bookingWindowDays,
  today = new Date(),
}: {
  targetTripCostMinor: MinorUnits | null;
  currentSavingsMinor?: MinorUnits;
  savingsCapacityMinor: MinorUnits | null;
  savingsCadence: IdeaSavingsCadence | null;
  /** Cadence picked in the card when the idea carries no Scout pace. */
  preferredCadence?: SavingsCadence;
  targetMonth: string | null;
  startDate: string | null;
  endDate: string | null;
  durationDays: number | null;
  /** Overrides the fare-based estimate; pass the idea's own window when known. */
  bookingWindowDays?: number;
  today?: Date;
}): IdeaSchedule | null {
  if (targetTripCostMinor == null) return null;

  const start = startOfDay(today);
  const days = Math.min(MAX_TRAVEL_WINDOW_DAYS, Math.max(1, durationDays ?? DEFAULT_TRIP_DAYS));
  const window = bookingWindowDays ?? flightBookingWindowDays(null);

  // A date the traveler set is authoritative, even when it was edited by hand
  // and no longer carries Scout's timing answer.
  const pinnedStart =
    startDate && isValid(parseISO(startDate)) ? parseISO(startDate) : null;
  const pinnedEnd = pinnedStart
    ? endDate && isValid(parseISO(endDate))
      ? parseISO(endDate)
      : addDays(pinnedStart, days - 1)
    : null;
  const pinnedMonth = monthStart(targetMonth);

  const hasPace = savingsCapacityMinor != null && savingsCapacityMinor > 0n;
  let cadence: SavingsCadence = savingsCadence ?? preferredCadence ?? "monthly";
  const remaining =
    targetTripCostMinor > currentSavingsMinor ? targetTripCostMinor - currentSavingsMinor : 0n;

  let periods: number;
  let contributionMinor: MinorUnits;
  let readyFromSavings: Date | null = null;

  if (hasPace) {
    periods = Math.min(MAX_SAVINGS_PERIODS, Number(ceilDivide(remaining, savingsCapacityMinor!)));
    contributionMinor = savingsCapacityMinor!;
    readyFromSavings =
      cadence === "weekly" ? addWeeks(start, periods) : addMonths(start, periods);
  } else {
    // Date-driven: the traveler fixed a departure, so the goal is split across
    // the periods that fit before it. The calculator owns that arithmetic.
    const anchor = pinnedStart ?? pinnedMonth;
    if (!anchor) return null;
    const suggestion = calculateSavingsSuggestion({
      tripStartDate: isoDate(anchor),
      targetTripCostMinor,
      currentSavingsMinor,
      cadence,
      bookingWindowDays: window,
      today: start,
    });
    if (suggestion.status === "missing-input") return null;
    if (suggestion.status === "due-now") {
      periods = 1;
      contributionMinor = suggestion.amountMinor;
    } else {
      periods = suggestion.periods;
      contributionMinor = suggestion.contributionMinor;
      cadence = suggestion.cadence;
    }
  }

  // A pinned month leaves in that month, but never before the goal is reached.
  const departure =
    pinnedStart ??
    (pinnedMonth && readyFromSavings && isBefore(pinnedMonth, readyFromSavings)
      ? readyFromSavings
      : (pinnedMonth ?? readyFromSavings));

  if (!departure) return null;

  const departureEnd = pinnedEnd ?? addDays(departure, days - 1);
  const span = Math.min(
    MAX_TRAVEL_WINDOW_DAYS,
    Math.max(1, differenceInCalendarDays(departureEnd, departure) + 1)
  );
  const ready = readyFromSavings ?? departure;
  const bookByTarget = addDays(departure, -window);

  let shortfallMinor: MinorUnits | null = null;
  if (pinnedStart && hasPace) {
    const elapsed = Math.max(
      0,
      cadence === "weekly"
        ? differenceInWeeks(pinnedStart, start)
        : differenceInMonths(pinnedStart, start)
    );
    const covered = savingsCapacityMinor! * BigInt(elapsed);
    shortfallMinor = remaining > covered ? remaining - covered : 0n;
  }

  return {
    hasPace,
    contributionMinor,
    cadence,
    periods,
    readyOn: isoDate(ready),
    bookBy: isoDate(isBefore(bookByTarget, start) ? start : bookByTarget),
    departureStart: isoDate(departure),
    departureEnd: isoDate(addDays(departure, span - 1)),
    days: span,
    shortfallMinor,
    isEstimate: pinnedStart === null,
  };
}
