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
    const result = splitEqual(100, ["a", "b", "c"]);
    expect(result.assignedTotal).toBe(100);
    expect(result.shares.map((s) => s.shareAmount)).toEqual([34, 33, 33]);
  });

  it("splitExact requires exact sum and preserves given amounts", () => {
    const result = splitExact(100, { a: 40, b: 60 });
    expect(result.assignedTotal).toBe(100);
    expect(result.shares).toEqual([
      { userId: "a", shareAmount: 40, sharePercentage: 40 },
      { userId: "b", shareAmount: 60, sharePercentage: 60 },
    ]);
  });

  it("splitExact throws when shares do not sum to total", () => {
    expect(() => splitExact(100, { a: 40, b: 50 })).toThrow();
  });

  it("splitPercentage assigns last participant rounding remainder", () => {
    const result = splitPercentage(100, ["a", "b"], { a: 33, b: 67 });
    expect(result.assignedTotal).toBe(100);
    // 33% of 100 = 33; remainder goes to b.
    expect(result.shares[0].shareAmount).toBe(33);
    expect(result.shares[1].shareAmount).toBe(67);
  });

  it("splitPercentage throws when percentages do not sum to 100", () => {
    expect(() => splitPercentage(100, ["a", "b"], { a: 30, b: 60 })).toThrow();
  });

  it("calculateSplit dispatches to equal mode by default", () => {
    const result = calculateSplit({
      totalCents: 100,
      payerId: "p",
      participants: ["a", "b"],
      mode: "equal",
    });
    expect(result.shares.every((s) => s.shareAmount === 50)).toBe(true);
  });

  it("calculateBalances reconciles payer and participants", () => {
    const balances = calculateBalances([
      { amount: 100, paidBy: "p", shares: [{ userId: "a", shareAmount: 40 }] },
    ]);
    // Payer paid 100 but owes nothing in this scenario; a owes 40.
    expect(balances["p"]).toBe(100);
    expect(balances["a"]).toBe(-40);
  });
});
