import { describe, expect, it } from "vitest";

import { decimalFromMinorUnits, formatMinorUnits, getCurrencyExponent, parseMinorUnits } from "@/features/domain/money";

describe("money domain", () => {
  it("parses two-decimal currencies without floating-point arithmetic", () => {
    expect(parseMinorUnits("123.45", "USD")).toBe(12345n);
    expect(parseMinorUnits("0.1", "eur")).toBe(10n);
  });

  it("parses zero-decimal currencies", () => {
    expect(getCurrencyExponent("JPY")).toBe(0);
    expect(parseMinorUnits("1500", "JPY")).toBe(1500n);
    expect(() => parseMinorUnits("1.5", "JPY")).toThrow("does not support fractional");
  });

  it("rejects invalid, negative, over-precision, and unsupported values", () => {
    expect(() => parseMinorUnits("-1.00", "USD")).toThrow();
    expect(() => parseMinorUnits("1.001", "USD")).toThrow("at most 2");
    expect(() => parseMinorUnits("1e3", "USD")).toThrow();
    expect(() => parseMinorUnits("1", "ABC")).toThrow("Unsupported currency");
    expect(parseMinorUnits("99999999.99", "USD")).toBe(9999999999n);
    expect(() => parseMinorUnits("100000000.00", "USD")).toThrow("too large");
  });

  it("converts minor units to exact editable decimal strings", () => {
    expect(decimalFromMinorUnits(12345n, "USD")).toBe("123.45");
    expect(decimalFromMinorUnits(-5n, "USD")).toBe("-0.05");
    expect(decimalFromMinorUnits(1500n, "JPY")).toBe("1500");
  });

  it("formats values beyond the safe number range", () => {
    expect(formatMinorUnits(900719925474099312345n, "USD", "en-US")).toBe("$9,007,199,254,740,993,123.45");
    expect(formatMinorUnits(-1234n, "EUR", "en-US")).toBe("-€12.34");
  });
});
