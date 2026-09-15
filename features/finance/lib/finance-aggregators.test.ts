import { describe, expect, it } from "vitest";

import type { MinorUnits } from "@/features/domain/money";
import {
  getBudgetUsage,
  getCategoryTotalSpent,
  getDailyPacing,
  getGroupTotalSpent,
  getPersonalLeftover,
  getPersonalPlanned,
  getPersonalTotalSpent,
  getPlannedTotal,
  getTrueLeftover,
  type AggregateExpense,
} from "./finance-aggregators";

const BASE = "USD";

function expense(partial: Partial<AggregateExpense> & Pick<AggregateExpense, "amountMinor" | "currency">): AggregateExpense {
  return {
    exchangeRateToBase: null,
    paidBy: "p",
    date: "2026-09-03",
    shares: [],
    ...partial,
  };
}

describe("getGroupTotalSpent", () => {
  it("sums base-currency expenses directly", () => {
    const total = getGroupTotalSpent(
      [expense({ amountMinor: 10000n, currency: "USD" }), expense({ amountMinor: 2500n, currency: "USD" })],
      BASE
    );
    expect(total).toBe(12500n);
  });

  it("converts foreign expenses to base via exchange rate", () => {
    // 10000 JPY * 0.0067 USD/JPY = 67.00 USD = 6700 USD minor
    const total = getGroupTotalSpent(
      [expense({ amountMinor: 10000n, currency: "JPY", exchangeRateToBase: 0.0067 })],
      BASE
    );
    expect(total).toBe(6700n);
  });

  it("excludes foreign expenses without a usable exchange rate", () => {
    const total = getGroupTotalSpent([expense({ amountMinor: 10000n, currency: "JPY", exchangeRateToBase: null })], BASE);
    expect(total).toBe(0n);
  });
});

describe("getCategoryTotalSpent", () => {
  it("sums only expenses in the matching category", () => {
    const items: AggregateExpense[] = [
      expense({ amountMinor: 10000n, currency: "USD", category: "food" }),
      expense({ amountMinor: 5000n, currency: "USD", category: "transport" }),
      expense({ amountMinor: 2000n, currency: "USD" }), // uncategorized
    ];
    expect(getCategoryTotalSpent(items, "food", BASE)).toBe(10000n);
    expect(getCategoryTotalSpent(items, "transport", BASE)).toBe(5000n);
    expect(getCategoryTotalSpent(items, "stay", BASE)).toBe(0n);
  });

  it("converts foreign expenses in the category to base currency", () => {
    const items: AggregateExpense[] = [
      expense({ amountMinor: 10000n, currency: "JPY", exchangeRateToBase: 0.0067, category: "food" }),
      expense({ amountMinor: 2000n, currency: "USD", category: "food" }),
    ];
    // 10000 JPY * 0.0067 = 67.00 USD = 6700 + 2000 = 8700 USD minor
    expect(getCategoryTotalSpent(items, "food", BASE)).toBe(8700n);
  });

  it("excludes unconvertible foreign expenses in the category", () => {
    const items: AggregateExpense[] = [
      expense({ amountMinor: 10000n, currency: "JPY", exchangeRateToBase: null, category: "food" }),
    ];
    expect(getCategoryTotalSpent(items, "food", BASE)).toBe(0n);
  });
});

describe("getBudgetUsage", () => {
  it("returns the spent/total ratio", () => {
    expect(getBudgetUsage(5000n, 10000n)).toBe(0.5);
    expect(getBudgetUsage(8000n, 10000n)).toBe(0.8);
    expect(getBudgetUsage(12000n, 10000n)).toBe(1.2);
  });

  it("returns null when there is no budget to measure against", () => {
    expect(getBudgetUsage(5000n, 0n)).toBeNull();
  });
});

describe("getPersonalTotalSpent", () => {
  it("sums a user's shares converted to base currency", () => {
    const items: AggregateExpense[] = [
      expense({ amountMinor: 10000n, currency: "USD", shares: [{ userId: "me", shareAmountMinor: 4000n }] }),
      expense({ amountMinor: 10000n, currency: "JPY", exchangeRateToBase: 0.0067, shares: [{ userId: "me", shareAmountMinor: 5000n }] }),
    ];
    // 4000 USD minor + (5000 JPY * 0.0067 = 33.5 USD = 3350 USD minor)
    expect(getPersonalTotalSpent(items, "me", BASE)).toBe(7350n);
  });

  it("returns zero when the user has no share", () => {
    expect(getPersonalTotalSpent([expense({ amountMinor: 10000n, currency: "USD", shares: [{ userId: "other", shareAmountMinor: 10000n }] })], "me", BASE)).toBe(0n);
  });
});

describe("wallet math", () => {
  it("computes personal leftover as starting balance minus spent", () => {
    expect(getPersonalLeftover({ startingBalanceMinor: 100000n, currency: "USD" }, 40000n)).toBe(60000n);
  });

  it("computes true leftover subtracting both actuals and planned", () => {
    expect(getTrueLeftover({ startingBalanceMinor: 100000n, currency: "USD" }, 40000n, 20000n)).toBe(40000n);
  });

  it("allows true leftover to go negative when over budget", () => {
    expect(getTrueLeftover({ startingBalanceMinor: 10000n, currency: "USD" }, 8000n, 5000n)).toBe(-3000n);
  });
});

describe("planned estimates", () => {
  const activities = [
    { dayDate: "2026-09-01", estimatedCostMinor: 10000n as MinorUnits },
    { dayDate: "2026-09-04", estimatedCostMinor: 20000n as MinorUnits }, // upcoming
    { dayDate: "2026-09-05", estimatedCostMinor: 30000n as MinorUnits }, // upcoming
    { dayDate: "2026-09-06", estimatedCostMinor: null }, // no estimate
  ];

  it("sums upcoming estimated costs", () => {
    expect(getPlannedTotal(activities, "2026-09-04")).toBe(50000n);
  });

  it("splits planned equally across members (floored)", () => {
    expect(getPersonalPlanned(activities, "2026-09-04", 4)).toBe(12500n);
    expect(getPersonalPlanned(activities, "2026-09-04", 1)).toBe(50000n);
  });
});

describe("getDailyPacing", () => {
  it("reports under budget", () => {
    const pacing = getDailyPacing(
      "2026-09-03",
      [expense({ amountMinor: 5000n, currency: "USD", date: "2026-09-03" })],
      10000n,
      null,
      BASE
    );
    expect(pacing).toEqual({ date: "2026-09-03", currency: "USD", spent: 5000n, budget: 10000n, remaining: 5000n, status: "under" });
  });

  it("reports over budget", () => {
    const pacing = getDailyPacing(
      "2026-09-03",
      [expense({ amountMinor: 15000n, currency: "USD", date: "2026-09-03" })],
      10000n,
      null,
      BASE
    );
    expect(pacing.status).toBe("over");
    expect(pacing.remaining).toBe(-5000n);
  });

  it("reports at budget exactly", () => {
    const pacing = getDailyPacing("2026-09-03", [expense({ amountMinor: 10000n, currency: "USD", date: "2026-09-03" })], 10000n, null, BASE);
    expect(pacing.status).toBe("at");
  });

  it("uses a daily override instead of the derived day budget", () => {
    const pacing = getDailyPacing(
      "2026-09-03",
      [expense({ amountMinor: 12000n, currency: "USD", date: "2026-09-03" })],
      10000n,
      { customBudgetAmountMinor: 15000n },
      BASE
    );
    expect(pacing.budget).toBe(15000n);
    expect(pacing.status).toBe("under");
  });

  it("only counts expenses on the requested date", () => {
    const pacing = getDailyPacing(
      "2026-09-03",
      [expense({ amountMinor: 5000n, currency: "USD", date: "2026-09-02" }), expense({ amountMinor: 7000n, currency: "USD", date: "2026-09-03" })],
      10000n,
      null,
      BASE
    );
    expect(pacing.spent).toBe(7000n);
  });
});
