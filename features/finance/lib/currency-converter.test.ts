import { describe, expect, it } from "vitest";

import {
  calculateTipBreakdown,
  convertAmount,
  convertMinorUnits,
  formatAmount,
  getTipCustoms,
  lookupRate,
  minorExponent,
  parseAmount,
} from "@/features/finance/lib/currency-converter";
import { DEFAULT_TIP_CUSTOMS } from "@/features/finance/lib/currency-converter";

describe("minorExponent", () => {
  it("returns 2 for typical two-decimal currencies", () => {
    expect(minorExponent("USD")).toBe(2);
    expect(minorExponent("EUR")).toBe(2);
  });

  it("returns 0 for zero-decimal currencies", () => {
    expect(minorExponent("JPY")).toBe(0);
    expect(minorExponent("KRW")).toBe(0);
  });

  it("is case-insensitive and tolerant of unknown codes", () => {
    expect(minorExponent("usd")).toBe(2);
    expect(minorExponent("XXX")).toBe(2);
  });
});

describe("parseAmount", () => {
  it("parses decimal strings into minor units without floats", () => {
    expect(parseAmount("123.45", "USD")).toBe(12345n);
    expect(parseAmount("0.1", "EUR")).toBe(10n);
    expect(parseAmount("1500", "JPY")).toBe(1500n);
  });

  it("rejects over-precision, fractional zero-decimal, and invalid input", () => {
    expect(() => parseAmount("1.001", "USD")).toThrow("at most 2");
    expect(() => parseAmount("1.5", "JPY")).toThrow("does not support fractional");
    expect(() => parseAmount("-5", "USD")).toThrow();
    expect(() => parseAmount("abc", "USD")).toThrow();
  });
});

describe("formatAmount", () => {
  it("formats minor units with the currency symbol and grouping", () => {
    expect(formatAmount(12345n, "USD", "en-US")).toMatch(/\$/);
    expect(formatAmount(12345n, "USD", "en-US")).toContain("123.45");
    expect(formatAmount(1500n, "JPY", "en-US")).toContain("1,500");
  });

  it("handles negatives", () => {
    expect(formatAmount(-5n, "USD", "en-US")).toContain("0.05");
  });
});

describe("convertMinorUnits", () => {
  it("converts across exponents and rounds to the target minor unit", () => {
    // $100.00 USD → EUR at 0.92 → €92.00.
    expect(convertMinorUnits(10000n, "USD", 0.92, "EUR")).toBe(9200n);
    // $100.00 USD → JPY at 150 → ¥15,000.
    expect(convertMinorUnits(10000n, "USD", 150, "JPY")).toBe(15000n);
    // €100.00 → USD at (1/0.92 ≈ 1.08696) → $108.70.
    expect(convertMinorUnits(10000n, "EUR", 1 / 0.92, "USD")).toBe(10870n);
  });

  it("rounds to the nearest minor unit", () => {
    // $1.00 → EUR at 0.885 → €0.885 → rounds to 0.89 (89 minor).
    expect(convertMinorUnits(100n, "USD", 0.885, "EUR")).toBe(89n);
    // Same input rounding down at 0.884 → 0.884 → 0.88.
    expect(convertMinorUnits(100n, "USD", 0.884, "EUR")).toBe(88n);
  });

  it("returns the amount unchanged for the same currency", () => {
    expect(convertMinorUnits(5000n, "USD", 1, "USD")).toBe(5000n);
  });

  it("throws on an invalid rate", () => {
    expect(() => convertMinorUnits(100n, "USD", -1, "EUR")).toThrow("Invalid exchange rate");
    expect(() => convertMinorUnits(100n, "USD", Number.NaN, "EUR")).toThrow("Invalid exchange rate");
  });
});

describe("convertAmount", () => {
  it("converts a decimal string end-to-end", () => {
    expect(convertAmount("100", "USD", 0.92, "EUR")).toContain("92.00");
    expect(convertAmount("50", "USD", 150, "JPY")).toContain("7,500");
  });
});

describe("lookupRate", () => {
  it("computes cross rates through USD", () => {
    // 1 EUR = 1 / 0.92 USD ≈ 1.087.
    expect(lookupRate("EUR", "USD")).toBeCloseTo(1 / 0.92, 5);
    // 1 USD = 150 JPY.
    expect(lookupRate("USD", "JPY")).toBe(150);
  });

  it("returns 1 for identical currencies", () => {
    expect(lookupRate("USD", "USD")).toBe(1);
  });

  it("throws for currencies without a default rate", () => {
    expect(() => lookupRate("USD", "XXX")).toThrow("No default rate");
  });
});

describe("calculateTipBreakdown", () => {
  it("computes tip, tax, and total for a typical bill", () => {
    const result = calculateTipBreakdown({
      subtotalMinor: 10000n, // $100.00
      currency: "USD",
      tipPercent: 18,
      taxPercent: 8,
    });
    expect(result.tipMinor).toBe(1800n); // $18.00
    expect(result.taxMinor).toBe(800n); // $8.00
    expect(result.totalMinor).toBe(12600n); // $126.00
    expect(result.people).toBe(1);
    expect(result.perPersonMinor).toBe(12600n);
  });

  it("splits evenly across people", () => {
    const result = calculateTipBreakdown({
      subtotalMinor: 10000n,
      currency: "USD",
      tipPercent: 10,
      people: 4,
    });
    // Total 11000 → 2750 each.
    expect(result.totalMinor).toBe(11000n);
    expect(result.perPersonMinor).toBe(2750n);
  });

  it("handles zero tip and zero tax", () => {
    const result = calculateTipBreakdown({
      subtotalMinor: 5000n,
      currency: "EUR",
      tipPercent: 0,
    });
    expect(result.tipMinor).toBe(0n);
    expect(result.taxMinor).toBe(0n);
    expect(result.totalMinor).toBe(5000n);
  });

  it("rounds fractional tip percentages", () => {
    const result = calculateTipBreakdown({
      subtotalMinor: 1000n, // $10.00
      currency: "USD",
      tipPercent: 8.875,
    });
    // $10.00 * 8.875% = $0.8875 → $0.89.
    expect(result.tipMinor).toBe(89n);
  });

  it("defaults people to one when omitted or invalid", () => {
    const single = calculateTipBreakdown({ subtotalMinor: 100n, currency: "USD", tipPercent: 10 });
    const invalid = calculateTipBreakdown({ subtotalMinor: 100n, currency: "USD", tipPercent: 10, people: 0 });
    expect(single.people).toBe(1);
    expect(invalid.people).toBe(1);
  });
});

describe("getTipCustoms", () => {
  it("matches known destinations case-insensitively", () => {
    expect(getTipCustoms("Trip to Tokyo").flag).toBe("🇯🇵");
    expect(getTipCustoms("New York City").flag).toBe("🇺🇸");
    expect(getTipCustoms("Cancun, Mexico").flag).toBe("🇲🇽");
    expect(getTipCustoms("London").flag).toBe("🇬🇧");
  });

  it("returns the general default when nothing matches", () => {
    expect(getTipCustoms("The Moon")).toEqual(DEFAULT_TIP_CUSTOMS);
    expect(getTipCustoms(null)).toEqual(DEFAULT_TIP_CUSTOMS);
  });
});
