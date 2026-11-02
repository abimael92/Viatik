import { describe, expect, it } from "vitest";

import {
  TEMPLATE_SAVINGS_HORIZONS,
  templateCostEstimate,
} from "@/features/community/domain/template-cost-estimate";

const base = {
  days: 5,
  travelers: 2,
  baseCurrency: "USD",
  flightPerPerson: 900,
  dailyPerPerson: 100,
  hotelPerNight: 200,
  currency: "USD",
};

describe("templateCostEstimate", () => {
  it("prices flights per traveler and the stay per party", () => {
    // 900 × 2 + 100 × 5 × 2 + 200 × 4 nights = 3600.
    const estimate = templateCostEstimate(base)!;
    expect(estimate.totalMinor).toBe(360_000n);
    expect(estimate.perTravelerMinor).toBe(180_000n);
    expect(estimate.travelers).toBe(2);
    expect(estimate.currency).toBe("USD");
  });

  it("compares the 3-month and 5-month saving windows", () => {
    expect(TEMPLATE_SAVINGS_HORIZONS).toEqual([3, 5]);
    const estimate = templateCostEstimate(base)!;
    expect(estimate.monthly).toEqual([
      { months: 3, amountMinor: 120_000n },
      { months: 5, amountMinor: 72_000n },
    ]);
  });

  it("rounds each saving window up so the goal is always covered", () => {
    // 901 × 2 + 100 × 5 × 2 + 200 × 4 = 3602 USD → 1200.67 and 720.40 a month.
    const odd = templateCostEstimate({ ...base, flightPerPerson: 901 })!;
    expect(odd.totalMinor).toBe(360_200n);
    expect(odd.monthly[0]!.amountMinor).toBe(120_067n);
    expect(odd.monthly[1]!.amountMinor).toBe(72_040n);
  });

  it("converts into the traveler's currency with the offline rate table", () => {
    const estimate = templateCostEstimate({ ...base, currency: "MXN" })!;
    expect(estimate.currency).toBe("MXN");
    expect(estimate.totalMinor).toBeGreaterThan(360_000n);
    expect(estimate.monthly[0]!.amountMinor).toBeGreaterThan(estimate.monthly[1]!.amountMinor);
  });

  it("keeps zero-decimal currencies in whole units", () => {
    const estimate = templateCostEstimate({ ...base, currency: "JPY" })!;
    expect(estimate.totalMinor % 1n).toBe(0n);
    expect(estimate.totalMinor).toBeGreaterThan(360_000n);
  });

  it("omits the estimate for a currency the money domain cannot price", () => {
    expect(templateCostEstimate({ ...base, currency: "AUD" })).toBeNull();
    expect(templateCostEstimate({ ...base, baseCurrency: "AUD" })).toBeNull();
  });

  it("rejects an impossible party or trip length", () => {
    expect(() => templateCostEstimate({ ...base, travelers: 0 })).toThrow(RangeError);
    expect(() => templateCostEstimate({ ...base, days: 0 })).toThrow(RangeError);
  });
});
