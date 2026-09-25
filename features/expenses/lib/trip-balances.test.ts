import { describe, expect, it } from "vitest";

import { buildTripBalances, calculatePairwiseDebts } from "@/features/expenses/lib/trip-balances";
import type { SettlementExpense } from "@/features/expenses/lib/settlement";

function splitEven(paidBy: string, other: string, amountMinor: bigint): SettlementExpense {
  const half = amountMinor / 2n;
  return {
    amountMinor,
    currency: "USD",
    exchangeRateToBase: null,
    paidBy,
    shares: [
      { userId: paidBy, shareAmountMinor: half },
      { userId: other, shareAmountMinor: amountMinor - half },
    ],
  };
}

describe("trip ledger balances", () => {
  it("turns a $100 50/50 expense into a $50 pairwise debt", () => {
    const debts = calculatePairwiseDebts(
      [splitEven("aby", "traveler-b", 10000n)],
      [],
      "USD",
    );

    expect(debts).toEqual([
      { payerId: "traveler-b", receiverId: "aby", amountMinor: 5000n, currency: "USD" },
    ]);
  });

  it("nets a matching settlement to zero without needing expense mutation", () => {
    const expenses = [splitEven("aby", "traveler-b", 10000n)];
    const settlements = [
      {
        fromUserId: "traveler-b",
        toUserId: "aby",
        amountMinor: 5000n,
        currency: "USD",
        deletedAt: null,
      },
    ];

    const result = buildTripBalances(expenses, settlements, "USD");
    expect(result.pairwiseDebts).toEqual([]);
    expect(result.balances["aby"] ?? 0n).toBe(0n);
    expect(result.balances["traveler-b"] ?? 0n).toBe(0n);
    expect(result.transfers).toEqual([]);
  });

  it("aggregates several coffee debts into one remaining pair", () => {
    const expenses = [
      splitEven("aby", "traveler-b", 600n),
      splitEven("aby", "traveler-b", 400n),
    ];
    const debts = calculatePairwiseDebts(expenses, [], "USD");
    expect(debts).toEqual([
      { payerId: "traveler-b", receiverId: "aby", amountMinor: 500n, currency: "USD" },
    ]);
  });

  it("ignores deleted settlements", () => {
    const debts = calculatePairwiseDebts(
      [splitEven("aby", "traveler-b", 10000n)],
      [
        {
          fromUserId: "traveler-b",
          toUserId: "aby",
          amountMinor: 5000n,
          currency: "USD",
          deletedAt: "2026-09-24T00:00:00.000Z",
        },
      ],
      "USD",
    );
    expect(debts[0]?.amountMinor).toBe(5000n);
  });
});
