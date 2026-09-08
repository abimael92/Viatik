import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Expense, Trip, TripBudget } from "@/features/domain/entities";
import { currencyRateRepository } from "@/features/finance/data/dexie-currency-rate-repository";
import { FinanceView } from "@/features/finance/components/finance-view";

if (typeof window !== "undefined") {
  window.matchMedia ??= () => ({ matches: false, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as unknown as MediaQueryList;
}

vi.mock("@/features/finance/data/dexie-currency-rate-repository", () => ({
  currencyRateRepository: {
    getRate: vi.fn(),
    saveRate: vi.fn(),
    ensureDefaults: vi.fn().mockResolvedValue(undefined),
    listRates: vi.fn(),
  },
}));

vi.mock("@/features/expenses/data/dexie-expense-repository", () => ({
  expenseRepository: {
    watchByTrip: vi.fn((_tripId: string, cb: (expenses: Expense[]) => void) => {
      cb([]);
      return () => {};
    }),
    listSharesByExpense: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/features/finance/data/dexie-finance-repository", () => ({
  tripBudgetRepository: {
    watchByTrip: vi.fn((_tripId: string, cb: (budget: TripBudget | undefined) => void) => {
      cb(undefined);
      return () => {};
    }),
    upsert: vi.fn(),
    update: vi.fn(),
  },
  userWalletRepository: {},
}));

// Stub the heavy legacy dashboard + converter for a focused FinanceView test.
vi.mock("@/features/finance/components/finance-dashboard", () => ({
  FinanceDashboard: () => <div data-testid="finance-dashboard" />,
  FinanceSummaryStrip: () => null,
}));

const trip: Trip = {
  id: "trip-1",
  ownerId: "owner-1",
  name: "Paris Week",
  description: null,
  destination: "Paris",
  latitude: null,
  longitude: null,
  placeId: null,
  timeZone: null,
  startDate: "2026-06-01",
  endDate: "2026-06-08",
  coverImageUrl: null,
  adultCount: 2,
  childCount: 0,
  baseCurrency: "USD",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  deletedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(currencyRateRepository.getRate).mockResolvedValue(undefined);
});

afterEach(() => cleanup());

describe("FinanceView", () => {
  it("shows the trip total, currency card, and finance dashboard", () => {
    render(<FinanceView tripId={trip.id} userId="user-1" trip={trip} days={["2026-06-01"]} canEdit />);

    // Trip total (moved here from the Budget hero).
    expect(screen.getByText(/Trip total/)).toBeTruthy();
    // Currency card (tip tied to the trip location).
    expect(screen.getByText(/Trip currency & rate/)).toBeTruthy();
    expect(screen.getByText(/Tip in Paris: 5–10%/)).toBeTruthy();
    // Finance dashboard (My Finances / Group Finances) is restored.
    expect(screen.getByTestId("finance-dashboard")).toBeTruthy();
    // Category envelopes are disabled.
    expect(screen.queryByText(/Category envelopes/)).toBeNull();
  });
});
