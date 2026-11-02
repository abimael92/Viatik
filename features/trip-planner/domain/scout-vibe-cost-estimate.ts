import { getCurrencyExponent, type MinorUnits } from "@/features/domain/money";
import type { ScoutTripIdeaSuggestion } from "@/features/trip-planner/domain/scout-trip-ideas-schema";
import type { ScoutVibeCategory } from "@/features/trip-planner/domain/scout-vibe-category";

/** Every vibe prices the same trip so the five options stay comparable. */
export const SCOUT_VIBE_TRIP_DAYS = 5;
/** The crew question comes after the vibe question, so the card assumes a duo. */
export const SCOUT_VIBE_REFERENCE_CREW = 2;
/** The booking window the estimate describes: leaving 3–5 months from now. */
export const SCOUT_VIBE_WINDOW_MONTHS = { from: 3, to: 5 } as const;

type ReferenceDestination = {
  /** Shown nowhere: it documents which real destination a baseline came from. */
  destination: string;
  /** Round-trip fare per traveler, whole USD. */
  flightPerPersonUsd: number;
  /** Meals, local transport and activities per traveler per day, whole USD. */
  dailyPerPersonUsd: number;
  /** One room or one rental per night for the whole crew, whole USD. */
  hotelPerNightUsd: number;
};

/**
 * Scout's historical baselines for the destination pool each vibe draws from.
 * These are the same figures the deterministic generator uses, kept here so the
 * wizard can price a vibe before it calls the provider.
 */
const REFERENCE_DESTINATIONS: Record<ScoutVibeCategory, readonly ReferenceDestination[]> = {
  beach: [
    { destination: "Cancun, Mexico", flightPerPersonUsd: 340, dailyPerPersonUsd: 75, hotelPerNightUsd: 160 },
    { destination: "Puerto Vallarta, Mexico", flightPerPersonUsd: 380, dailyPerPersonUsd: 70, hotelPerNightUsd: 150 },
    { destination: "Lisbon, Portugal", flightPerPersonUsd: 720, dailyPerPersonUsd: 95, hotelPerNightUsd: 190 },
    { destination: "Split, Croatia", flightPerPersonUsd: 780, dailyPerPersonUsd: 90, hotelPerNightUsd: 175 },
    { destination: "Bali, Indonesia", flightPerPersonUsd: 1150, dailyPerPersonUsd: 60, hotelPerNightUsd: 120 },
  ],
  city: [
    { destination: "Montreal, Canada", flightPerPersonUsd: 340, dailyPerPersonUsd: 95, hotelPerNightUsd: 210 },
    { destination: "Mexico City, Mexico", flightPerPersonUsd: 420, dailyPerPersonUsd: 85, hotelPerNightUsd: 150 },
    { destination: "Madrid, Spain", flightPerPersonUsd: 700, dailyPerPersonUsd: 100, hotelPerNightUsd: 180 },
    { destination: "Prague, Czechia", flightPerPersonUsd: 760, dailyPerPersonUsd: 85, hotelPerNightUsd: 150 },
    { destination: "Tokyo, Japan", flightPerPersonUsd: 1100, dailyPerPersonUsd: 110, hotelPerNightUsd: 220 },
  ],
  nature: [
    { destination: "Banff, Canada", flightPerPersonUsd: 420, dailyPerPersonUsd: 85, hotelPerNightUsd: 240 },
    { destination: "San Jose, Costa Rica", flightPerPersonUsd: 560, dailyPerPersonUsd: 80, hotelPerNightUsd: 150 },
    { destination: "Interlaken, Switzerland", flightPerPersonUsd: 880, dailyPerPersonUsd: 120, hotelPerNightUsd: 260 },
    { destination: "Queenstown, New Zealand", flightPerPersonUsd: 1400, dailyPerPersonUsd: 110, hotelPerNightUsd: 210 },
    { destination: "Reykjavik, Iceland", flightPerPersonUsd: 850, dailyPerPersonUsd: 105, hotelPerNightUsd: 230 },
  ],
  food: [
    { destination: "Oaxaca, Mexico", flightPerPersonUsd: 410, dailyPerPersonUsd: 60, hotelPerNightUsd: 130 },
    { destination: "Bologna, Italy", flightPerPersonUsd: 760, dailyPerPersonUsd: 90, hotelPerNightUsd: 170 },
    { destination: "Porto, Portugal", flightPerPersonUsd: 680, dailyPerPersonUsd: 85, hotelPerNightUsd: 160 },
    { destination: "Ho Chi Minh City, Vietnam", flightPerPersonUsd: 980, dailyPerPersonUsd: 55, hotelPerNightUsd: 110 },
    { destination: "Kyoto, Japan", flightPerPersonUsd: 1050, dailyPerPersonUsd: 95, hotelPerNightUsd: 200 },
  ],
  default: [
    { destination: "Cartagena, Colombia", flightPerPersonUsd: 400, dailyPerPersonUsd: 70, hotelPerNightUsd: 150 },
    { destination: "Medellin, Colombia", flightPerPersonUsd: 430, dailyPerPersonUsd: 65, hotelPerNightUsd: 130 },
    { destination: "Marrakech, Morocco", flightPerPersonUsd: 720, dailyPerPersonUsd: 70, hotelPerNightUsd: 150 },
    { destination: "Athens, Greece", flightPerPersonUsd: 800, dailyPerPersonUsd: 85, hotelPerNightUsd: 165 },
    { destination: "Tbilisi, Georgia", flightPerPersonUsd: 760, dailyPerPersonUsd: 60, hotelPerNightUsd: 120 },
  ],
};

/**
 * Currency baselines as an exact ratio rather than a floating multiplier, so a
 * converted estimate never passes through a float. Mirrors the provider-side
 * baselines the generator uses for its whole-unit estimates.
 */
const SCOUT_CURRENCY_RATIO: Record<string, { numerator: bigint; denominator: bigint }> = {
  USD: { numerator: 1n, denominator: 1n },
  EUR: { numerator: 92n, denominator: 100n },
  GBP: { numerator: 80n, denominator: 100n },
  CAD: { numerator: 135n, denominator: 100n },
  MXN: { numerator: 18n, denominator: 1n },
  JPY: { numerator: 150n, denominator: 1n },
};

export type ScoutVibeCostEstimate = {
  category: ScoutVibeCategory;
  /** Days the figure is priced for; always `SCOUT_VIBE_TRIP_DAYS`. */
  tripDays: number;
  crewSize: number;
  /** Average all-in cost for the whole crew, integer minor units. */
  totalMinor: MinorUnits;
  /** Average all-in cost per traveler, integer minor units. */
  perTravelerMinor: MinorUnits;
  /** True when the figure came from ideas Scout already generated. */
  fromGeneratedIdeas: boolean;
  /** Destinations behind the average. */
  sampleSize: number;
};

function ceilDivide(amount: bigint, divisor: bigint): bigint {
  return amount === 0n ? 0n : (amount + divisor - 1n) / divisor;
}

function convertFromUsd(amount: bigint, ratio: { numerator: bigint; denominator: bigint }): bigint {
  return (amount * ratio.numerator + ratio.denominator / 2n) / ratio.denominator;
}

/** Whole-unit all-in cost for one destination at exactly `days` days. */
function groupTotalWholeUnits({
  flightPerPerson,
  dailyPerPerson,
  hotelPerNight,
  days,
  crewSize,
}: {
  flightPerPerson: number;
  dailyPerPerson: number;
  hotelPerNight: number;
  days: number;
  crewSize: number;
}): bigint {
  const crew = BigInt(crewSize);
  const nights = BigInt(Math.max(1, days - 1));
  return (
    BigInt(flightPerPerson) * crew +
    BigInt(dailyPerPerson) * BigInt(days) * crew +
    BigInt(hotelPerNight) * nights
  );
}

/**
 * Average per-traveler cost of a 5-day trip leaving 3–5 months from now.
 *
 * The figure prefers Scout's own estimates when the traveler already generated
 * ideas — every suggestion is re-priced at exactly 5 days and averaged — and
 * otherwise uses the reference pool for the vibe. Returns `null` for a currency
 * Scout does not plan in, so the card omits the line instead of showing a wrong
 * number.
 */
export function scoutVibeCostEstimate({
  category,
  currency,
  suggestions = [],
  crewSize = SCOUT_VIBE_REFERENCE_CREW,
}: {
  category: ScoutVibeCategory;
  currency: string;
  suggestions?: readonly ScoutTripIdeaSuggestion[];
  crewSize?: number;
}): ScoutVibeCostEstimate | null {
  if (!Number.isInteger(crewSize) || crewSize < 1) {
    throw new RangeError("At least one traveler is required.");
  }

  const code = currency.toUpperCase();
  const ratio = SCOUT_CURRENCY_RATIO[code];
  if (!ratio) return null;

  const scale = 10n ** BigInt(getCurrencyExponent(code));
  const days = SCOUT_VIBE_TRIP_DAYS;

  const totals: bigint[] = suggestions.length
    ? suggestions.map((suggestion) =>
        groupTotalWholeUnits({
          flightPerPerson: suggestion.estimated_flight_cost_per_person,
          dailyPerPerson: suggestion.estimated_daily_budget_per_person,
          hotelPerNight: suggestion.estimated_hotel_per_night,
          days,
          crewSize,
        })
      )
    : REFERENCE_DESTINATIONS[category].map((destination) =>
        groupTotalWholeUnits({
          flightPerPerson: destination.flightPerPersonUsd,
          dailyPerPerson: destination.dailyPerPersonUsd,
          hotelPerNight: destination.hotelPerNightUsd,
          days,
          crewSize,
        })
      );

  if (totals.length === 0) return null;

  const sum = totals.reduce((total, value) => total + value, 0n);
  const averageWhole = ceilDivide(sum, BigInt(totals.length));
  const totalMinor =
    (suggestions.length ? averageWhole : convertFromUsd(averageWhole, ratio)) * scale;

  return {
    category,
    tripDays: days,
    crewSize,
    totalMinor,
    perTravelerMinor: ceilDivide(totalMinor, BigInt(crewSize)),
    fromGeneratedIdeas: suggestions.length > 0,
    sampleSize: totals.length,
  };
}
