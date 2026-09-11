import { describe, it, expect } from "vitest";
import { expensesToCsv, downloadExpensesCsv } from "./export-csv";
import type { Expense } from "@/features/domain/entities";

const mockExpenses: Expense[] = [
  {
    id: "exp-1",
    tripId: "trip-1",
    activityId: null,
    description: "Lunch at cafe",
    amountMinor: 2500n,
    currency: "USD",
    exchangeRateToBase: 1.0,
    paidBy: "user-1",
    splitType: "equal",
    category: "food",
    subcategory: "restaurants",
    date: "2024-06-15",
    createdBy: "user-1",
    createdAt: "2024-06-15T12:00:00Z",
    updatedAt: "2024-06-15T12:00:00Z",
    deletedAt: null,
  },
  {
    id: "exp-2",
    tripId: "trip-1",
    activityId: "act-1",
    description: 'Dinner with "friends"',
    amountMinor: 5000n,
    currency: "EUR",
    exchangeRateToBase: 1.1,
    paidBy: "user-2",
    splitType: "equal",
    category: "food",
    subcategory: "restaurants",
    date: "2024-06-16",
    createdBy: "user-2",
    createdAt: "2024-06-16T19:00:00Z",
    updatedAt: "2024-06-16T19:00:00Z",
    deletedAt: null,
  },
  {
    id: "exp-3",
    tripId: "trip-1",
    activityId: null,
    description: "Transport",
    amountMinor: 1500n,
    currency: "USD",
    exchangeRateToBase: 1.0,
    paidBy: "user-1",
    splitType: "equal",
    category: "transport",
    subcategory: "uber",
    date: "2024-06-14",
    createdBy: "user-1",
    createdAt: "2024-06-14T08:00:00Z",
    updatedAt: "2024-06-14T08:00:00Z",
    deletedAt: null,
  },
];

describe("expensesToCsv", () => {
  it("generates correct CSV with headers and escaped values", () => {
    const csv = expensesToCsv(mockExpenses);

    // Check headers
    expect(csv).toContain("Date,Title,Category,Amount,Currency,Paid By");

    // Check data rows (sorted by date descending)
    // formatMinorUnits adds currency symbols ($ for USD, € for EUR)
    expect(csv).toContain('2024-06-16,"Dinner with ""friends""",food,€50.00 EUR,EUR,user-2');
    expect(csv).toContain('2024-06-15,Lunch at cafe,food,$25.00 USD,USD,user-1');
    expect(csv).toContain('2024-06-14,Transport,transport,$15.00 USD,USD,user-1');
  });

  it("handles empty expense array", () => {
    const csv = expensesToCsv([]);
    expect(csv).toBe("Date,Title,Category,Amount,Currency,Paid By");
  });

  it("escapes commas and quotes correctly", () => {
    const expenseWithComma: Expense = {
      ...mockExpenses[0],
      id: "exp-comma",
      description: "Lunch, dinner",
    };
    const csv = expensesToCsv([expenseWithComma]);
    expect(csv).toContain('"Lunch, dinner"');
  });
});

describe("downloadExpensesCsv", () => {
  it("creates blob and triggers download (smoke test)", () => {
    // Just verify the function runs without throwing
    // (Full DOM mocking is complex in vitest/jsdom)
    expect(() => downloadExpensesCsv(mockExpenses)).not.toThrow();
    expect(() => downloadExpensesCsv([])).not.toThrow();
  });
});