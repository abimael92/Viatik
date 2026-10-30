import { describe, expect, it } from "vitest";

import {
  LONG_HAUL_BOOKING_WINDOW_DAYS,
  SHORT_HAUL_BOOKING_WINDOW_DAYS,
  flightBookingWindowDays,
} from "@/features/trip-planner/domain/flight-booking-window";

describe("flightBookingWindowDays", () => {
  it("treats a short-haul USD fare as short-haul", () => {
    expect(flightBookingWindowDays(420, "USD")).toBe(SHORT_HAUL_BOOKING_WINDOW_DAYS);
  });

  it("treats an expensive USD fare as long-haul", () => {
    expect(flightBookingWindowDays(1_100, "USD")).toBe(LONG_HAUL_BOOKING_WINDOW_DAYS);
  });

  it("compares peso fares in USD instead of raw units", () => {
    // MX$3,366 is roughly US$195: short-haul, not long-haul.
    expect(flightBookingWindowDays(3_366, "MXN")).toBe(SHORT_HAUL_BOOKING_WINDOW_DAYS);
    expect(flightBookingWindowDays(20_000, "MXN")).toBe(LONG_HAUL_BOOKING_WINDOW_DAYS);
  });

  it("defaults to the short-haul window without a fare", () => {
    expect(flightBookingWindowDays(null, "USD")).toBe(SHORT_HAUL_BOOKING_WINDOW_DAYS);
    expect(flightBookingWindowDays(undefined, "USD")).toBe(SHORT_HAUL_BOOKING_WINDOW_DAYS);
  });
});
