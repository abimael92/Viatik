import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Expense, Trip, TripBudget } from "@/features/domain/entities";
import { currencyRateRepository } from "@/features/finance/data/dexie-currency-rate-repository";
import { tripBudgetRepository } from "@/features/finance/data/dexie-finance-repository";
import { CategoryEnvelopes, MoneyDashboard } from "@/features/finance/components/money-dashboard";
import { useSettlement } from "@/features/expenses/lib/use-settlement";

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

vi.mock("@/features/expenses/components/expense-panel", () => ({
  ExpensePanel: () => <div data-testid="expense-panel" />,
}));
vi.mock("@/features/expenses/components/settlement-view", () => ({
  SettlementView: () => <div data-testid="settlement-view" />,
}));
vi.mock("@/features/expenses/lib/use-settlement", () => ({
  useSettlement: vi.fn(() => ({ loading: false, balances: {}, transfers: [], members: [] })),
}));

let expensesCallback: ((expenses: Expense[]) => void) | null = null;
let budgetCallback: ((budget: TripBudget | undefined) => void) | null = null;

vi.mock("@/features/expenses/data/dexie-expense-repository", () => ({
  expenseRepository: {
    watchByTrip: vi.fn((_tripId: string, cb: (expenses: Expense[]) => void) => {
      expensesCallback = cb;
      cb([]);
      return () => {};
    }),
    listSharesByExpense: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/features/finance/data/dexie-finance-repository", () => ({
  tripBudgetRepository: {
    watchByTrip: vi.fn((_tripId: string, cb: (budget: TripBudget | undefined) => void) => {
      budgetCallback = cb;
      cb(undefined);
      return () => {};
    }),
    upsert: vi.fn(),
    update: vi.fn(),
  },
  userWalletRepository: {},
}));

let mockPreferredCurrency: string | null = null;
vi.mock("@/features/profile/lib/use-local-profile", () => ({
  useLocalProfile: () => ({ preferredCurrency: mockPreferredCurrency }),
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
  status: "planned",
  startedAt: null,
  completedAt: null,
  coverImageUrl: null,
  adultCount: 2,
  childCount: 0,
  baseCurrency: "USD",
  createdBy: "owner-1",
  updatedBy: "owner-1",
  deletedBy: null,
  restoredAt: null,
  restoredBy: null,
  cancelledAt: null,
  statusChangedAt: "2026-01-01T00:00:00Z",
  statusChangedBy: "owner-1",
  version: 1,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  deletedAt: null,
};

const budget: TripBudget = {
  id: "budget-1",
  tripId: "trip-1",
  totalBudgetMinor: 100000n,
  dailyTargetMinor: 5000n,
  categoryAllocations: [{ category: "food", allocationMinor: 50000n, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }],
  createdBy: "owner-1",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  deletedAt: null,
};

function makeExpense(partial: Partial<Expense>): Expense {
  return {
    id: "expense-1",
    tripId: "trip-1",
    activityId: null,
    description: "Dinner",
    amountMinor: 30000n,
    currency: "USD",
    exchangeRateToBase: null,
    paidBy: "user-1",
    splitType: "equal",
    category: "food",
    subcategory: "restaurants",
    date: "2026-06-02",
    createdBy: "user-1",
    createdAt: "2026-06-02T12:00:00.000Z",
    updatedAt: "2026-06-02T12:00:00.000Z",
    deletedAt: null,
    ...partial,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPreferredCurrency = null;
  expensesCallback = null;
  vi.mocked(useSettlement).mockReturnValue({ loading: false, balances: {}, transfers: [], members: [] });
  budgetCallback = null;
  vi.mocked(currencyRateRepository.getRate).mockResolvedValue(undefined);
  vi.mocked(tripBudgetRepository.upsert).mockResolvedValue(budget);
  vi.mocked(tripBudgetRepository.update).mockResolvedValue(budget);
  if (typeof crypto !== "undefined" && !crypto.randomUUID) {
    (crypto as { randomUUID?: () => string }).randomUUID = () => "test-uuid";
  }
});

afterEach(() => cleanup());

describe("MoneyDashboard (Budget tab)", () => {
  it("shows a no-budget warning when no budget is set", () => {
    render(<MoneyDashboard tripId={trip.id} userId="user-1" trip={trip} days={["2026-06-01"]} canEdit />);
    expect(screen.getByText(/Trip spending/)).toBeTruthy();
    expect(screen.getByText(/No budget set — add a total trip budget/)).toBeTruthy();
  });

  it("shows view-only guidance and hides financial mutation actions", () => {
    render(<MoneyDashboard tripId={trip.id} userId="user-1" trip={trip} days={["2026-06-01"]} canEdit={false} />);

    expect(screen.getByText("You have view-only access. You can review expenses and balances, but only owners and editors can change financial data.")).toBeTruthy();
    expect(screen.getByText("Track group spending, manage your trip budget, record expenses, and see how much each traveler owes or is owed.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit budget" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add Expense" })).toBeNull();
    expect(screen.queryByRole("button", { name: "View Settlement" })).toBeNull();
  });

  it("opens settlement from the primary action when transfers are needed", () => {
    vi.mocked(useSettlement).mockReturnValue({
      loading: false,
      balances: { "user-1": -4250n, "user-2": 4250n },
      transfers: [{ fromUserId: "user-1", toUserId: "user-2", amountMinor: 4250n, currency: "USD" }],
      members: [],
    });
    render(<MoneyDashboard tripId={trip.id} userId="user-1" trip={trip} days={["2026-06-01"]} canEdit />);

    fireEvent.click(screen.getByRole("button", { name: "View Settlement" }));

    expect(screen.getByRole("dialog", { name: "Settlement" })).toBeTruthy();
  });

  it("shows spent vs. budget reactively", async () => {
    render(<MoneyDashboard tripId={trip.id} userId="user-1" trip={trip} days={["2026-06-01", "2026-06-02"]} canEdit />);

    act(() => {
      expensesCallback?.([makeExpense({})]);
      budgetCallback?.(budget);
    });

    // The budget is shown as the prominent remaining amount when no expenses are recorded.
    expect(screen.getAllByText(/\$1,000\.00 USD/).length).toBeGreaterThan(0);
    expect(screen.getByText("Spent")).toBeTruthy();
    expect(screen.getByText("Budget set")).toBeTruthy();
    expect(screen.getAllByText(/\$1,000\.00 USD/).length).toBeGreaterThan(0);
  });

  it("edits the total budget and persists via the repository", async () => {
    render(<MoneyDashboard tripId={trip.id} userId="user-1" trip={trip} days={["2026-06-01"]} canEdit />);
    act(() => budgetCallback?.(budget));

    fireEvent.click(screen.getByRole("button", { name: "Edit budget" }));
    const totalInput = screen.getByLabelText(/Total trip budget/);
    fireEvent.change(totalInput, { target: { value: "1500" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save budget" }));
      await Promise.resolve();
    });

    expect(tripBudgetRepository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ tripId: "trip-1", totalBudgetMinor: 150000n })
    );
  });
});

  it("swaps the Trip spending currency when settings currency differs from location currency", () => {
    mockPreferredCurrency = "MXN";
    render(<MoneyDashboard tripId={trip.id} userId="user-1" trip={trip} days={["2026-06-01"]} canEdit />);

    // Paris → location EUR; settings MXN → the swap button appears.
    const swap = screen.getByRole("button", { name: /Swap currency/ });

    // Amount starts in the base currency (USD), then swaps to the settings currency (MXN).
    expect(screen.getAllByText(/\$0\.00 USD/).length).toBeGreaterThan(0);
    fireEvent.click(swap);
    expect(screen.getAllByText(/\$0\.00 MXN/).length).toBeGreaterThan(0);
  });

  it("opens the money tools modal from a deep-link intent", () => {
    render(<MoneyDashboard tripId={trip.id} userId="user-1" trip={trip} days={["2026-06-01"]} canEdit autoOpenTools />);
    expect(screen.getByRole("dialog", { name: "Money tools" })).toBeTruthy();
    expect(screen.getByLabelText("Amount")).toBeTruthy();
  });

  it("opens the money tools modal and switches between converter and tip tabs", async () => {
    render(<MoneyDashboard tripId={trip.id} userId="user-1" trip={trip} days={["2026-06-01"]} canEdit />);

    fireEvent.pointerDown(screen.getByRole("button", { name: "More money actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Money tools/ }));

    // Currency converter tab is shown by default.
    expect(screen.getByLabelText("Amount")).toBeTruthy();

    // Switch to the tip & split calculator.
    fireEvent.click(screen.getByRole("button", { name: /Tip & split calculator/ }));
    expect(screen.getByLabelText("Subtotal")).toBeTruthy();
  });

describe("CategoryEnvelopes", () => {
  it("renders envelopes with spent vs. allocated caps", async () => {
    render(<CategoryEnvelopes tripId={trip.id} userId="user-1" baseCurrency="USD" canEdit />);

    act(() => {
      expensesCallback?.([makeExpense({})]);
      budgetCallback?.(budget);
    });

    expect(await screen.findByText("Food")).toBeTruthy();
    // 30000 spent / 50000 allocated → the allocated cap is shown.
    expect(screen.getByText(/\$500\.00/)).toBeTruthy();
  });

  it("sets a category cap and persists it", async () => {
    render(<CategoryEnvelopes tripId={trip.id} userId="user-1" baseCurrency="USD" canEdit />);
    act(() => budgetCallback?.(budget));

    fireEvent.click(screen.getByRole("button", { name: /Set Food cap/ }));
    const capInput = screen.getByLabelText(/Cap/);
    fireEvent.change(capInput, { target: { value: "600" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(tripBudgetRepository.update).toHaveBeenCalledWith(
        "budget-1",
        expect.objectContaining({
          categoryAllocations: expect.arrayContaining([
            expect.objectContaining({ category: "food", allocationMinor: 60000n }),
          ]),
        })
      )
    );
  });
});
