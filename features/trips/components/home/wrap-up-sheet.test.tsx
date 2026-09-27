import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Trip } from "@/features/domain/entities";
import type { PackingItem } from "@/features/packing/domain/packing-types";
import { WrapUpSheet } from "@/features/trips/components/home/wrap-up-sheet";

vi.mock("@/features/packing/data/dexie-packing-repository", () => ({
  packingRepository: {
    watchByTrip: vi.fn((_tripId: string, onChange: (items: PackingItem[]) => void) => {
      onChange([
        {
          id: "item-1",
          tripId: "trip-1",
          category: "gear",
          name: "Adapter",
          quantity: 1,
          isPacked: true,
          packedForReturn: false,
          isSuggested: false,
          suggestedReason: null,
          position: 0,
          createdAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-01T00:00:00.000Z",
          deletedAt: null,
        },
      ]);
      return () => {};
    }),
    applySuggested: vi.fn(),
    toggle: vi.fn(),
    setPacked: vi.fn(),
    setPackedForReturn: vi.fn(),
    remove: vi.fn(),
    updateQuantity: vi.fn(),
    addCustom: vi.fn(),
    resetToSuggested: vi.fn(),
  },
}));

vi.mock("@/features/activities/data/dexie-activity-repository", () => ({
  activityRepository: {
    watchByTrip: vi.fn((_tripId: string, onChange: (activities: unknown[]) => void) => {
      onChange([
        {
          id: "flight",
          tripId: "trip-1",
          dayDate: "2099-01-01",
          title: "Flight home",
          category: "transit",
          startTime: "2026-09-27T18:00:00",
          deletedAt: null,
          position: 1,
        },
        {
          id: "lunch",
          tripId: "trip-1",
          dayDate: "2099-01-01",
          title: "Lunch",
          category: "food-and-drink",
          startTime: "2026-09-27T12:00:00",
          deletedAt: null,
          position: 0,
        },
      ]);
      return () => {};
    }),
  },
}));

vi.mock("@/features/expenses/lib/use-trip-balances", () => ({
  useTripBalances: () => ({
    loading: false,
    balances: {},
    pairwiseDebts: [
      { payerId: "11111111-1111-4111-8111-111111111111", receiverId: "22222222-2222-4222-8222-222222222222", amountMinor: 5000n, currency: "USD" },
    ],
    transfers: [],
    members: [],
    settlements: [],
  }),
}));

vi.mock("@/features/finance/lib/use-trip-spending", () => ({
  useTripSpending: () => ({
    loading: false,
    expenses: [],
    budget: { totalBudgetMinor: 20000n },
    totalSpent: 8000n,
    categoryTotals: new Map(),
    allocations: new Map(),
  }),
}));

vi.mock("@/features/collaboration/data/dexie-collaboration-repository", () => ({
  collaborationRepository: { listProfiles: vi.fn().mockResolvedValue([]) },
}));

vi.mock("@/features/expenses/components/settle-up-sheet", () => ({
  SettleUpSheet: ({ open }: { open: boolean }) => (open ? <div>Settle up open</div> : null),
}));

vi.mock("@/features/trips/data/dexie-trip-repository", () => ({
  tripRepository: { update: vi.fn() },
}));

const trip = {
  id: "trip-1",
  name: "Mexico",
  destination: "Mexico City",
  startDate: "2026-09-20",
  endDate: "2099-01-01",
  timeZone: "UTC",
  status: "active",
  baseCurrency: "USD",
  packingConfirmed: false,
  latitude: null,
} as Trip;

describe("WrapUpSheet", () => {
  afterEach(() => cleanup());

  it("warns about unfinished return packing and debts without disabling End trip", () => {
    const onEndTrip = vi.fn();
    const onClose = vi.fn();
    render(<WrapUpSheet open trip={trip} userId="user-1" onClose={onClose} onEndTrip={onEndTrip} />);

    const warning = screen.getByRole("status");
    expect(warning.textContent).toContain("1 items are not packed for the return.");
    expect(warning.textContent).toContain("1 debts are still open.");
    expect(screen.getByText("Flight home")).toBeTruthy();
    expect(screen.queryByText("Lunch")).toBeNull();

    const end = screen.getByRole("button", { name: "End trip" }) as HTMLButtonElement;
    expect(end.disabled).toBe(false);
    fireEvent.click(end);
    expect(onEndTrip).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Not yet" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("opens the existing settle up sheet for an open debt", () => {
    render(<WrapUpSheet open trip={trip} userId="user-1" onClose={vi.fn()} onEndTrip={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Settle Up" }));
    expect(screen.getByText("Settle up open")).toBeTruthy();
  });
});
