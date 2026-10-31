import { describe, expect, it } from "vitest";

import { formatTravelWindow } from "@/features/trip-planner/domain/travel-window";

describe("formatTravelWindow", () => {
  it("collapses a same-month window", () => {
    expect(formatTravelWindow({ start: "2026-12-01", end: "2026-12-04" }, "en")).toBe(
      "1 – 4 Dec 2026"
    );
  });

  it("spells both ends across months", () => {
    expect(formatTravelWindow({ start: "2026-12-28", end: "2027-01-02" }, "en")).toBe(
      "28 Dec 2026 – 2 Jan 2027"
    );
  });
});
