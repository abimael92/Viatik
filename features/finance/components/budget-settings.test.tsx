import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Trip, TripBudget } from "@/features/domain/entities";
import { currencyRateRepository } from "@/features/finance/data/dexie-currency-rate-repository";
import { tripBudgetRepository } from "@/features/finance/data/dexie-finance-repository";
import { BudgetSettings } from "@/features/finance/components/budget-settings";

if (typeof window !== "undefined") {
  window.matchMedia ??= () => ({ matches: false, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as unknown as MediaQueryList;
}

vi.mock("@/features/finance/data/dexie-currency-rate-repository", () => ({
  currencyRateRepository: {
    getRate: vi.fn(),
    ensureDefaults: vi.fn().mockResolvedValue(undefined),
    saveRate: vi.fn(),
    listRates: vi.fn(),
  },
}));

let budgetCallback: ((budget: TripBudget | undefined) => void) | null = null;

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
  categoryAllocations: [],
  createdBy: "owner-1",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  deletedAt: null,
};

beforeEach(() => {
  mockPreferredCurrency = null;
  vi.clearAllMocks();
  budgetCallback = null;
  vi.mocked(currencyRateRepository.getRate).mockResolvedValue(undefined);
  vi.mocked(tripBudgetRepository.upsert).mockResolvedValue(budget);
  if (typeof crypto !== "undefined" && !crypto.randomUUID) {
    (crypto as { randomUUID?: () => string }).randomUUID = () => "test-uuid";
  }
});

afterEach(() => cleanup());

describe("BudgetSettings", () => {
  it("shows the no-budget warning and a read-only local→base conversion", async () => {
    render(<BudgetSettings trip={trip} userId="user-1" canEdit />);

    expect(screen.getByText(/Trip budget & spending/)).toBeTruthy();
    // No budget set yet → amber warning mirrors trip readiness.
    expect(screen.getByText(/No budget set/)).toBeTruthy();
    // "Paris" → Europe → local EUR; read-only "1 EUR → … USD · local → your currency".
    expect(screen.getByText(/1 EUR/)).toBeTruthy();
    expect(screen.getByText(/local → your currency/)).toBeTruthy();
  });

  it("reflects a set budget reactively and shows the daily target", async () => {
    render(<BudgetSettings trip={trip} userId="user-1" canEdit />);
    act(() => budgetCallback?.(budget));

    expect(await screen.findByText("$1,000.00")).toBeTruthy();
    expect(screen.getByText(/\$50\.00/)).toBeTruthy();
    expect(screen.queryByText(/No budget set/)).toBeNull();
  });

  it("suggests a recommended daily amount from the total budget and trip days", async () => {
    render(<BudgetSettings trip={trip} userId="user-1" canEdit />);
    act(() => budgetCallback?.(budget));

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    // 8-day trip (2026-06-01 → 2026-06-08), $1,000 total → $112.50/day
    // recommended ($1,000 × 90% ÷ 8 days), keeping a ~10% buffer.
    expect(screen.getByText(/\$112\.50/)).toBeTruthy();
    expect(screen.getByText(/over 8 days/)).toBeTruthy();
  });

  it("uses the user's preferred currency for the total budget when different from the trip base", async () => {
    mockPreferredCurrency = "USD";
    const mxnTrip = { ...trip, baseCurrency: "MXN" };
    render(<BudgetSettings trip={mxnTrip} userId="user-1" canEdit />);
    act(() => budgetCallback?.(budget));

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    // Total is entered in the user's currency (USD), not the trip base (MXN).
    expect(screen.getByLabelText(/Total trip budget \(USD\)/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/Total trip budget/), { target: { value: "100" } });

    // A conversion field shows the equivalent in the trip currency (MXN).
    expect(screen.getByText(/in MXN/)).toBeTruthy();
  });

  it("persists total + daily target via the repository", async () => {
    render(<BudgetSettings trip={trip} userId="user-1" canEdit />);

    fireEvent.click(screen.getByRole("button", { name: "Set budget" }));
    fireEvent.change(screen.getByLabelText(/Total trip budget/), { target: { value: "2000" } });
    fireEvent.change(screen.getByLabelText(/Daily spending target/), { target: { value: "200" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save budget" }));
      await Promise.resolve();
    });

    expect(tripBudgetRepository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ tripId: "trip-1", totalBudgetMinor: 200000n, dailyTargetMinor: 20000n })
    );
  });
});
