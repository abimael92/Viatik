import { describe, expect, it } from "vitest";

import {
  formatIsoTripDay,
  formatTripDay,
  formatTripRange,
} from "@/features/trip-planner/domain/date-format";

describe("trip date labels", () => {
  it("capitalizes the month in English", () => {
    expect(formatIsoTripDay("2027-09-03", "en")).toBe("3 Sep 2027");
  });

  it("capitalizes the month in Spanish", () => {
    expect(formatIsoTripDay("2027-09-03", "es")).toBe("3 Sept 2027");
    expect(formatIsoTripDay("2027-10-29", "es")).toBe("29 Oct 2027");
  });

  it("drops the trailing dot some locales add", () => {
    expect(formatTripDay(new Date(Date.UTC(2027, 8, 3)), "es")).not.toContain(".");
  });

  it("collapses a same-month range", () => {
    expect(formatTripRange("2026-12-01", "2026-12-04", "en")).toBe("1 – 4 Dec 2026");
  });

  it("spells both ends across months and years", () => {
    expect(formatTripRange("2026-12-28", "2027-01-02", "en")).toBe(
      "28 Dec 2026 – 2 Jan 2027"
    );
  });

  it("uses Spanish month names", () => {
    expect(formatTripRange("2027-10-29", "2027-11-02", "es")).toBe(
      "29 Oct – 2 Nov 2027"
    );
  });
});
