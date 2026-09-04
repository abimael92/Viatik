import { describe, it, expect } from "vitest";

import {
  splitEqual,
  splitExact,
  splitPercentage,
  calculateSplit,
  calculateBalances,
} from "./expense-calculator";

describe("expense-calculator", () => {
  it("splitEqual divides total cents evenly and absorbs remainder", () => {
    const result = splitEqual(100n, ["a", "b", "c"]);
    expect(result.assignedTotal).toBe(100n);
    expect(result.shares.map((s) => s.shareAmountMinor)).toEqual([34n, 33n, 33n]);
  });

  it("splitEqual rejects duplicate participants", () => {
    expect(() => splitEqual(100n, ["a", "a"])).toThrow("non-empty and unique");
  });

  it("splitExact requires exact sum and preserves given amounts", () => {
    const result = splitExact(100n, { a: 40n, b: 60n });
    expect(result.assignedTotal).toBe(100n);
    expect(result.shares).toEqual([
      { userId: "a", shareAmountMinor: 40n, sharePercentage: 40 },
      { userId: "b", shareAmountMinor: 60n, sharePercentage: 60 },
    ]);
  });

  it("splitExact throws when shares do not sum to total", () => {
    expect(() => splitExact(100n, { a: 40n, b: 50n })).toThrow();
  });

  it("rejects negative or empty exact shares", () => {
    expect(() => splitExact(0n, {})).toThrow("At least one participant");
    expect(() => splitExact(100n, { a: -1n, b: 101n })).toThrow("cannot be negative");
  });

  it("splitPercentage assigns last participant rounding remainder", () => {
    const result = splitPercentage(100n, ["a", "b"], { a: 33, b: 67 });
    expect(result.assignedTotal).toBe(100n);
    // 33% of 100 = 33; remainder goes to b.
    expect(result.shares[0].shareAmountMinor).toBe(33n);
    expect(result.shares[1].shareAmountMinor).toBe(67n);
  });

  it("splitPercentage rejects invalid participant and percentage maps", () => {
    expect(() => splitPercentage(100n, ["a", "b"], { a: 30, b: 60 })).toThrow();
    expect(() => splitPercentage(100n, [], {})).toThrow("non-empty and unique");
    expect(() => splitPercentage(100n, ["a", "b"], { a: 100, outsider: 0 })).toThrow("Every participant");
    expect(() => splitPercentage(100n, ["a", "b"], { a: -1, b: 101 })).toThrow("non-negative");
  });

  it("calculateSplit dispatches to equal mode by default", () => {
    const result = calculateSplit({
      totalMinor: 100n,
      payerId: "p",
      participants: ["a", "b"],
      mode: "equal",
    });
    expect(result.shares.every((s) => s.shareAmountMinor === 50n)).toBe(true);
  });

  it("calculateBalances reconciles payer and participants", () => {
    const balances = calculateBalances([
      { amountMinor: 100n, paidBy: "p", shares: [{ userId: "a", shareAmountMinor: 40n }] },
    ]);
    // Payer paid 100 but owes nothing in this scenario; a owes 40.
    expect(balances["p"]).toBe(100n);
    expect(balances["a"]).toBe(-40n);
  });
});
