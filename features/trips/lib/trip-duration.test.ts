import { describe, expect, it } from "vitest";

import { countTripDays, getMaxEndDate, getTripDurationError, assertValidTripDates } from "@/features/trips/lib/trip-duration";

describe("countTripDays", () => {
  it("returns null when either date is missing", () => {
    expect(countTripDays(null, "2026-01-01")).toBeNull();
    expect(countTripDays("2026-01-01", null)).toBeNull();
    expect(countTripDays(undefined, undefined)).toBeNull();
  });

  it("counts exactly 60 days as valid and 61 as over", () => {
    expect(countTripDays("2026-01-01", "2026-03-01")).toBe(60);
    expect(countTripDays("2026-01-01", "2026-03-02")).toBe(61);
  });

  it("handles leap year boundaries", () => {
    expect(countTripDays("2024-02-28", "2024-02-29")).toBe(2);
    expect(countTripDays("2024-02-29", "2024-04-28")).toBe(60);
    expect(countTripDays("2024-02-29", "2024-04-29")).toBe(61);
  });

  it("handles month boundaries", () => {
    expect(countTripDays("2026-01-31", "2026-02-01")).toBe(2);
    expect(countTripDays("2026-01-31", "2026-03-31")).toBe(60);
    expect(countTripDays("2026-01-31", "2026-04-01")).toBe(61);
  });

  it("handles year boundaries", () => {
    expect(countTripDays("2025-12-31", "2026-01-01")).toBe(2);
    expect(countTripDays("2025-12-31", "2026-02-28")).toBe(60);
    expect(countTripDays("2025-12-31", "2026-03-01")).toBe(61);
  });
});

describe("getMaxEndDate", () => {
  it("returns null when start date is missing", () => {
    expect(getMaxEndDate(null)).toBeNull();
    expect(getMaxEndDate("")).toBeNull();
  });

  it("computes start + 59 days", () => {
    expect(getMaxEndDate("2026-01-01")).toBe("2026-03-01");
    expect(getMaxEndDate("2024-02-29")).toBe("2024-04-28");
  });
});

describe("getTripDurationError", () => {
  it("returns no error when either date is missing", () => {
    expect(getTripDurationError("", "2026-01-01")).toBeNull();
    expect(getTripDurationError("2026-01-01", "")).toBeNull();
  });

  it("reports an inverted range", () => {
    expect(getTripDurationError("2026-01-05", "2026-01-01")).toBe("End date must be on or after the start date.");
  });

  it("accepts 60 days", () => {
    expect(getTripDurationError("2026-01-01", "2026-03-01")).toBeNull();
  });

  it("rejects 61 days with a clear message", () => {
    expect(getTripDurationError("2026-01-01", "2026-03-02")).toBe("Trips can be up to 60 days long. This trip is 61 days.");
  });
});

describe("assertValidTripDates", () => {
  it("does not throw for 60 days", () => {
    expect(() => assertValidTripDates("2026-01-01", "2026-03-01")).not.toThrow();
  });

  it("throws for 61 days", () => {
    expect(() => assertValidTripDates("2026-01-01", "2026-03-02")).toThrow("Trips can be up to 60 days long. This trip is 61 days.");
  });
});
