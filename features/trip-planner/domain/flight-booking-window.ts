/**
 * How far ahead of departure flights should be booked. Scout uses this to draw
 * its booking timeline, and the savings plan reuses it so both surfaces agree on
 * the same estimate instead of inventing a second number.
 */

/** Per-traveler fare at or above this many USD is treated as long-haul. */
export const LONG_HAUL_FARE_THRESHOLD_USD = 700;
export const LONG_HAUL_BOOKING_WINDOW_DAYS = 84;
export const SHORT_HAUL_BOOKING_WINDOW_DAYS = 56;

/**
 * Rough static rates, only used to compare a fare against the long-haul
 * threshold. Comparing raw amounts would treat every peso or yen fare as
 * long-haul, because 3,366 MXN is not 3,366 USD.
 */
const USD_PER_UNIT: Record<string, number> = {
  USD: 1,
  EUR: 1.09,
  GBP: 1.27,
  CAD: 0.74,
  MXN: 0.058,
  JPY: 0.0067,
};

/** Booking window in days for a per-traveler fare in whole currency units. */
export function flightBookingWindowDays(
  farePerPerson: number | null | undefined,
  currency: string = "USD"
): number {
  const rate = USD_PER_UNIT[currency.toUpperCase()] ?? 1;
  const fareUsd = (farePerPerson ?? 0) * rate;
  return fareUsd >= LONG_HAUL_FARE_THRESHOLD_USD
    ? LONG_HAUL_BOOKING_WINDOW_DAYS
    : SHORT_HAUL_BOOKING_WINDOW_DAYS;
}
