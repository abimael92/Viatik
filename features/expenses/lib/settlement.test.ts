import { describe, it, expect } from "vitest";

import type { MinorUnits } from "@/features/domain/money";
import {
  buildSettlement,
  calculateNetBalances,
  simplifyTransfers,
  type SettlementExpense,
  type SettlementTransfer,
} from "./settlement";

/** Builds a base-currency expense (no rate, same currency) for brevity. */
function expense(
  paidBy: string,
  amountMinor: MinorUnits,
  shares: Array<{ userId: string; shareAmountMinor: MinorUnits }>
): SettlementExpense {
  return { amountMinor, currency: "USD", exchangeRateToBase: null, paidBy, shares };
}

const transfer = (fromUserId: string, toUserId: string, amountMinor: MinorUnits): SettlementTransfer =>
  ({ fromUserId, toUserId, amountMinor, currency: "USD" });

describe("calculateNetBalances", () => {
  it("derives balances for a multi-person split", () => {
    const balances = calculateNetBalances(
      [expense("a", 300n, [{ userId: "b", shareAmountMinor: 150n }, { userId: "c", shareAmountMinor: 150n }])],
      "USD"
    );
    expect(balances).toEqual({ a: 300n, b: -150n, c: -150n });
  });

  it("nets multiple expenses across the group", () => {
    const balances = calculateNetBalances(
      [
        expense("a", 100n, [{ userId: "b", shareAmountMinor: 100n }]),
        expense("b", 60n, [{ userId: "c", shareAmountMinor: 60n }]),
        expense("a", 40n, [{ userId: "c", shareAmountMinor: 40n }]),
      ],
      "USD"
    );
    expect(balances).toEqual({ a: 140n, b: -40n, c: -100n });
  });

  it("produces all-zero balances when everyone settled their own share", () => {
    const balances = calculateNetBalances(
      [
        expense("a", 100n, [{ userId: "a", shareAmountMinor: 100n }]),
        expense("b", 100n, [{ userId: "b", shareAmountMinor: 100n }]),
      ],
      "USD"
    );
    expect(balances).toEqual({ a: 0n, b: 0n });
  });

  it("returns an empty map for no expenses", () => {
    expect(calculateNetBalances([], "USD")).toEqual({});
  });

  it("converts foreign-currency expenses into the base currency", () => {
    const balances = calculateNetBalances(
      [
        {
          amountMinor: 10000n, // EUR 100.00
          currency: "EUR",
          exchangeRateToBase: 1.1,
          paidBy: "a",
          shares: [{ userId: "b", shareAmountMinor: 10000n }],
        },
      ],
      "USD"
    );
    expect(balances).toEqual({ a: 11000n, b: -11000n });
  });

  it("skips foreign expenses with no exchange rate", () => {
    const balances = calculateNetBalances(
      [
        {
          amountMinor: 10000n,
          currency: "EUR",
          exchangeRateToBase: null,
          paidBy: "a",
          shares: [{ userId: "b", shareAmountMinor: 10000n }],
        },
      ],
      "USD"
    );
    expect(balances).toEqual({});
  });
});

describe("simplifyTransfers", () => {
  it("returns no transfers for exact (zero) balances", () => {
    expect(simplifyTransfers({ a: 0n, b: 0n }, "USD")).toEqual([]);
  });

  it("returns no transfers for an empty balance map", () => {
    expect(simplifyTransfers({}, "USD")).toEqual([]);
  });

  it("settles two parties with a single transfer", () => {
    expect(simplifyTransfers({ a: 100n, b: -100n }, "USD")).toEqual([transfer("b", "a", 100n)]);
  });

  it("matches the largest debtor with the largest creditor", () => {
    const transfers = simplifyTransfers({ a: 8000n, b: 2000n, c: -5000n, d: -5000n }, "USD");
    expect(transfers).toEqual([
      transfer("c", "a", 5000n),
      transfer("d", "a", 3000n),
      transfer("d", "b", 2000n),
    ]);
  });

  it("collapses a chain into the minimal number of transfers", () => {
    // Naive per-expense settlement needs 3 transfers:
    //   b→a 100, c→b 60, c→a 40.
    // Greedy simplification needs only 2.
    const transfers = simplifyTransfers({ a: 140n, b: -40n, c: -100n }, "USD");
    expect(transfers).toEqual([transfer("c", "a", 100n), transfer("b", "a", 40n)]);
  });

  it("breaks ties deterministically by insertion order", () => {
    const transfers = simplifyTransfers({ a: 100n, b: 100n, c: -100n, d: -100n }, "USD");
    expect(transfers).toEqual([transfer("c", "a", 100n), transfer("d", "b", 100n)]);
  });

  it("never produces more transfers than non-zero balances minus one", () => {
    const balances = { a: 500n, b: 300n, c: 120n, d: -200n, e: -320n, f: -400n };
    const nonZero = Object.values(balances).filter((b) => b !== 0n).length;
    const transfers = simplifyTransfers(balances, "USD");
    expect(transfers.length).toBeLessThanOrEqual(nonZero - 1);
  });

  it("sum of transfer amounts equals the total owed by debtors", () => {
    const balances = { a: 500n, b: 300n, c: -200n, d: -400n, e: -200n };
    const transfers = simplifyTransfers(balances, "USD");
    const totalTransferred = transfers.reduce((sum, t) => sum + t.amountMinor, 0n);
    const totalDebt = Object.values(balances).filter((b) => b < 0n).reduce((sum, b) => sum + -b, 0n);
    expect(totalTransferred).toBe(totalDebt);
  });
});

describe("buildSettlement", () => {
  it("combines balances and transfers into a single plan", () => {
    const result = buildSettlement(
      [expense("a", 300n, [{ userId: "b", shareAmountMinor: 150n }, { userId: "c", shareAmountMinor: 150n }])],
      "USD"
    );
    expect(result.balances).toEqual({ a: 300n, b: -150n, c: -150n });
    expect(result.transfers).toEqual([transfer("b", "a", 150n), transfer("c", "a", 150n)]);
    expect(result.baseCurrency).toBe("USD");
  });

  it("returns an empty plan for an already-settled group", () => {
    const result = buildSettlement([], "USD");
    expect(result.balances).toEqual({});
    expect(result.transfers).toEqual([]);
  });
});
