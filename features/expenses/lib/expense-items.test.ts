import { describe, expect, it } from "vitest";

import {
  allocateExpenseItem,
  summarizeExpenseLineItems,
} from "@/features/expenses/lib/expense-items";

describe("expense item allocation", () => {
  it("splits shared item cents equally without losing minor units", () => {
    const item = allocateExpenseItem({
      id: "burger",
      description: "Burger",
      amountMinor: 100n,
      participants: ["traveler-a", "traveler-b", "traveler-c"],
      mode: "equal",
    });

    expect(item.allocations).toEqual([
      { userId: "traveler-a", shareAmountMinor: 34n },
      { userId: "traveler-b", shareAmountMinor: 33n },
      { userId: "traveler-c", shareAmountMinor: 33n },
    ]);
  });

  it("requires exact item allocations to match the item's total", () => {
    expect(() =>
      allocateExpenseItem({
        id: "combo",
        description: "Combo",
        amountMinor: 1250n,
        participants: ["traveler-a", "traveler-b"],
        mode: "exact",
        exactMinor: { "traveler-a": 700n, "traveler-b": 500n },
      }),
    ).toThrow("does not equal total");
  });

  it("aggregates item allocations into the existing expense share model", () => {
    const items = [
      allocateExpenseItem({
        id: "burger",
        description: "Burger",
        amountMinor: 1200n,
        participants: ["traveler-a"],
        mode: "equal",
      }),
      allocateExpenseItem({
        id: "sandwich",
        description: "Sandwich",
        amountMinor: 900n,
        participants: ["traveler-b"],
        mode: "equal",
      }),
      allocateExpenseItem({
        id: "fries",
        description: "Shared fries",
        amountMinor: 500n,
        participants: ["traveler-a", "traveler-b"],
        mode: "exact",
        exactMinor: { "traveler-a": 200n, "traveler-b": 300n },
      }),
    ];

    expect(summarizeExpenseLineItems(items)).toEqual({
      amountMinor: 2600n,
      shares: [
        { userId: "traveler-a", shareAmountMinor: 1400n, sharePercentage: 53.84, splitType: "exact" },
        { userId: "traveler-b", shareAmountMinor: 1200n, sharePercentage: 46.15, splitType: "exact" },
      ],
    });
  });

  it("rejects empty descriptions, non-positive amounts, and duplicate assignees", () => {
    expect(() =>
      allocateExpenseItem({
        id: "empty",
        description: "  ",
        amountMinor: 100n,
        participants: ["traveler-a"],
        mode: "equal",
      }),
    ).toThrow("description");
    expect(() =>
      allocateExpenseItem({
        id: "zero",
        description: "Tax",
        amountMinor: 0n,
        participants: ["traveler-a"],
        mode: "equal",
      }),
    ).toThrow("greater than zero");
    expect(() =>
      allocateExpenseItem({
        id: "duplicate",
        description: "Meal",
        amountMinor: 100n,
        participants: ["traveler-a", "traveler-a"],
        mode: "equal",
      }),
    ).toThrow("unique");
  });
});
