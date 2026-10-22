import { addDays, addMonths, addWeeks, format, isBefore, startOfDay } from "date-fns";

import { getCurrencyExponent, type CurrencyCode, type MinorUnits } from "@/features/domain/money";
import type { ScoutTripIdeaSuggestion } from "@/features/trip-planner/domain/scout-trip-ideas-schema";

/** Per-traveler fare at or above this many whole units is treated as long-haul. */
const LONG_HAUL_FARE_THRESHOLD = 700;
const LONG_HAUL_BOOKING_WINDOW_DAYS = 84;
const SHORT_HAUL_BOOKING_WINDOW_DAYS = 56;
/** How far past the earliest feasible departure the flexible window extends. */
const DEPARTURE_FLEX_DAYS = 13;
/** Upper bound on displayed savings periods so dates stay representable. */
const MAX_SAVINGS_PERIODS = 1200;

export type ScoutIdeaBudget = {
  nights: number;
  flightTotalMinor: MinorUnits;
  dailyTotalMinor: MinorUnits;
  grandTotalMinor: MinorUnits;
  stay: {
    nightlyHotelMinor: MinorUnits;
    nightlyAltMinor: MinorUnits;
    hotelTotalMinor: MinorUnits;
    altTotalMinor: MinorUnits;
    /** Positive when the rental is cheaper than the hotel. */
    altSavingsMinor: MinorUnits;
  };
};

export type ScoutIdeaPlan = ScoutIdeaBudget & {
  stay: ScoutIdeaBudget["stay"] & {
    checkIn: string;
    checkOut: string;
  };
  savings: {
    cadence: "weekly" | "monthly";
    contributionMinor: MinorUnits;
    periods: number;
    readyOn: string;
    /** False when the goal needs more than `MAX_SAVINGS_PERIODS` contributions. */
    withinReach: boolean;
  };
  flights: {
    bookingWindowDays: number;
    bookBy: string;
    earliestDeparture: string;
    latestDeparture: string;
    returnDate: string;
  };
};

function toMinorUnits(wholeCurrencyUnits: number, currency: CurrencyCode): MinorUnits {
  return BigInt(wholeCurrencyUnits) * 10n ** BigInt(getCurrencyExponent(currency));
}

function ceilDivide(amount: bigint, divisor: bigint): bigint {
  return amount === 0n ? 0n : (amount + divisor - 1n) / divisor;
}

function isoDate(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/**
 * Whole-crew budget for one Scout suggestion, in integer minor units. Lodging
 * is priced per night for the group; flights and daily spending are per
 * traveler.
 */
export function buildScoutIdeaBudget({
  suggestion,
  crewSize,
  currency,
}: {
  suggestion: ScoutTripIdeaSuggestion;
  crewSize: number;
  currency: CurrencyCode;
}): ScoutIdeaBudget {
  if (crewSize < 1) throw new RangeError("At least one traveler is required.");

  const crew = BigInt(crewSize);
  const days = suggestion.ideal_duration_days;
  const nights = Math.max(1, days - 1);

  const flightTotalMinor =
    toMinorUnits(suggestion.estimated_flight_cost_per_person, currency) * crew;
  const dailyTotalMinor =
    toMinorUnits(suggestion.estimated_daily_budget_per_person, currency) * BigInt(days) * crew;

  const nightlyHotelMinor = toMinorUnits(suggestion.estimated_hotel_per_night, currency);
  const nightlyAltMinor = toMinorUnits(suggestion.estimated_alt_stay_per_night, currency);
  const hotelTotalMinor = nightlyHotelMinor * BigInt(nights);
  const altTotalMinor = nightlyAltMinor * BigInt(nights);

  return {
    nights,
    flightTotalMinor,
    dailyTotalMinor,
    grandTotalMinor: flightTotalMinor + hotelTotalMinor + dailyTotalMinor,
    stay: {
      nightlyHotelMinor,
      nightlyAltMinor,
      hotelTotalMinor,
      altTotalMinor,
      altSavingsMinor: hotelTotalMinor - altTotalMinor,
    },
  };
}

/**
 * Derive the plan-relative facts for one Scout suggestion: the whole-crew
 * budget breakdown, how long the group's savings pace needs, and the flight
 * booking window. Everything is computed locally in integer minor units so the
 * AI never invents a date or a total.
 */
export function buildScoutIdeaPlan({
  suggestion,
  crewSize,
  savingsCapacityMinor,
  savingsCadence,
  currency,
  today = new Date(),
  timing = "asap",
  targetMonth = null,
}: {
  suggestion: ScoutTripIdeaSuggestion;
  crewSize: number;
  savingsCapacityMinor: MinorUnits;
  savingsCadence: "weekly" | "monthly";
  currency: CurrencyCode;
  today?: Date;
  timing?: "asap" | "month" | "cheapest";
  targetMonth?: string | null;
}): ScoutIdeaPlan {
  if (savingsCapacityMinor < 0n) throw new RangeError("Savings capacity must be non-negative.");

  const budget = buildScoutIdeaBudget({ suggestion, crewSize, currency });

  const rawPeriods =
    savingsCapacityMinor > 0n
      ? ceilDivide(budget.grandTotalMinor, savingsCapacityMinor)
      : BigInt(MAX_SAVINGS_PERIODS + 1);
  const withinReach = rawPeriods <= BigInt(MAX_SAVINGS_PERIODS);
  const periods = Number(withinReach ? rawPeriods : BigInt(MAX_SAVINGS_PERIODS));

  const start = startOfDay(today);
  const readyFromSavings =
    savingsCadence === "weekly" ? addWeeks(start, periods) : addMonths(start, periods);

  // A traveler who pinned a month leaves in that month, but never before the
  // savings goal is actually reached.
  const pinnedMonth =
    timing === "month" && targetMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(targetMonth)
      ? new Date(Number(targetMonth.slice(0, 4)), Number(targetMonth.slice(5, 7)) - 1, 1)
      : null;
  const ready =
    pinnedMonth && !isBefore(pinnedMonth, readyFromSavings) ? pinnedMonth : readyFromSavings;

  const bookingWindowDays =
    suggestion.estimated_flight_cost_per_person >= LONG_HAUL_FARE_THRESHOLD
      ? LONG_HAUL_BOOKING_WINDOW_DAYS
      : SHORT_HAUL_BOOKING_WINDOW_DAYS;
  const rawBookBy = addDays(ready, -bookingWindowDays);

  return {
    ...budget,
    stay: {
      ...budget.stay,
      checkIn: isoDate(ready),
      checkOut: isoDate(addDays(ready, budget.nights)),
    },
    savings: {
      cadence: savingsCadence,
      contributionMinor: savingsCapacityMinor,
      periods,
      readyOn: isoDate(ready),
      withinReach,
    },
    flights: {
      bookingWindowDays,
      bookBy: isoDate(isBefore(rawBookBy, start) ? start : rawBookBy),
      earliestDeparture: isoDate(ready),
      latestDeparture: isoDate(addDays(ready, DEPARTURE_FLEX_DAYS)),
      returnDate: isoDate(addDays(ready, budget.nights)),
    },
  };
}
