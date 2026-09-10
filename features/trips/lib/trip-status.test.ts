import { describe, expect, it } from "vitest";

import { resolveTripStatus } from "@/features/trips/lib/trip-status";

const TODAY = new Date("2026-09-09T12:00:00Z");

describe("resolveTripStatus", () => {
  it("returns the stored status for active", () => {
    expect(resolveTripStatus({ status: "active", startDate: "2026-09-01", endDate: "2026-09-20" }, TODAY)).toBe("active");
  });

  it("returns the stored status for completed", () => {
    expect(resolveTripStatus({ status: "completed", startDate: "2026-08-01", endDate: "2026-08-10" }, TODAY)).toBe("completed");
  });

  it("returns the stored status for cancelled", () => {
    expect(resolveTripStatus({ status: "cancelled", startDate: "2026-10-01", endDate: "2026-10-10" }, TODAY)).toBe("cancelled");
  });

  it("derives active from dates when stored status is planned and today is within range", () => {
    expect(resolveTripStatus({ status: "planned", startDate: "2026-09-09", endDate: "2026-09-15" }, TODAY)).toBe("active");
    expect(resolveTripStatus({ status: "planned", startDate: "2026-09-01", endDate: "2026-09-09" }, TODAY)).toBe("active");
  });

  it("stays planned when stored status is planned and today is before start or after end", () => {
    expect(resolveTripStatus({ status: "planned", startDate: "2026-10-01", endDate: "2026-10-10" }, TODAY)).toBe("planned");
    expect(resolveTripStatus({ status: "planned", startDate: "2026-08-01", endDate: "2026-08-10" }, TODAY)).toBe("planned");
  });

  it("falls back to date-derived active when status is missing (legacy record)", () => {
    expect(resolveTripStatus({ startDate: "2026-09-09", endDate: "2026-09-15" }, TODAY)).toBe("active");
  });

  it("defaults missing status and dates to planned", () => {
    expect(resolveTripStatus({}, TODAY)).toBe("planned");
    expect(resolveTripStatus({ status: null, startDate: null, endDate: null }, TODAY)).toBe("planned");
  });
});
