import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Expense, TripMember } from "@/features/domain/entities";
import { ExpensePanel } from "@/features/expenses/components/expense-panel";

if (typeof window !== "undefined") {
  window.matchMedia ??= () => ({ matches: false, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as unknown as MediaQueryList;
}

vi.mock("@/features/expenses/data/dexie-expense-repository", () => ({
  expenseRepository: {
    watchByTrip: vi.fn((_tripId: string, cb: (expenses: Expense[]) => void) => {
      expensesCallback = cb;
      cb([]);
      return () => {};
    }),
    listSharesByExpense: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn(),
    replaceShares: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock("@/features/collaboration/data/dexie-collaboration-repository", () => ({
  collaborationRepository: {
    watchMembers: vi.fn((_tripId: string, cb: (members: TripMember[]) => void) => {
      cb([]);
      return () => {};
    }),
    listProfiles: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/features/profile/lib/use-local-profile", () => ({
  useLocalProfile: vi.fn(() => null),
}));

let expensesCallback: ((expenses: Expense[]) => void) | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  expensesCallback = null;
  if (typeof crypto !== "undefined" && !crypto.randomUUID) {
    (crypto as { randomUUID?: () => string }).randomUUID = () => "test-uuid";
  }
});

afterEach(() => cleanup());

describe("ExpensePanel", () => {
  it("expands an expense to show split, currency, and local save details", async () => {
    const expense: Expense = {
      id: "expense-1",
      tripId: "trip-1",
      activityId: null,
      description: "Dinner",
      amountMinor: 4250n,
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
    };
    render(<ExpensePanel tripId="trip-1" userId="user-1" currency="USD" canEdit />);
    act(() => expensesCallback?.([expense]));

    fireEvent.click((await screen.findAllByRole("button", { name: /Dinner/ }))[0]);

    expect(screen.getAllByText(/Equal split/).length).toBeGreaterThan(0);
    expect(screen.getByText("Original amount")).toBeTruthy();
    expect(screen.getByText("Saved locally")).toBeTruthy();
    expect(screen.getAllByText("$42.50 USD").length).toBeGreaterThan(0);
  });
});

describe("ExpenseDialog", () => {
  it("defaults splitting to off and can be turned on", async () => {
    render(<ExpensePanel tripId="trip-1" userId="user-1" currency="USD" canEdit />);

    await screen.findByRole("button", { name: /Add expense/ });
    fireEvent.click(screen.getByRole("button", { name: /Add expense/ }));

    const splitToggle = screen.getByLabelText("Split this expense") as HTMLInputElement;
    // Splitting is OFF by default.
    expect(splitToggle.checked).toBe(false);
    expect(screen.getByText(/Recorded as your own expense/)).toBeTruthy();
    expect(screen.queryByText("Participants")).toBeNull();

    // Turning it on reveals paid-by / method / participants.
    fireEvent.click(splitToggle);
    expect(screen.getByText("Participants")).toBeTruthy();
  });

  it("quick-adds a free-text person (e.g. Mom) as a participant", async () => {
    render(<ExpensePanel tripId="trip-1" userId="user-1" currency="USD" canEdit />);

    await screen.findByRole("button", { name: /Add expense/ });
    fireEvent.click(screen.getByRole("button", { name: /Add expense/ }));

    // Quick-add only appears once splitting is turned on.
    fireEvent.click(screen.getByLabelText("Split this expense"));

    const quickAdd = screen.getByPlaceholderText(/Add a person, e.g\. Mom/);
    fireEvent.change(quickAdd, { target: { value: "Mom" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add" }));
      await Promise.resolve();
    });

    // The manual traveler is saved to the trip before appearing in the split.
    expect((await screen.findAllByText("Mom")).length).toBeGreaterThan(0);
    // With only the current user, the "no other travelers" hint appears.
    expect(screen.getByText(/No other travelers yet/)).toBeTruthy();
  });

  it("shows a read-only exchange rate and live conversion for foreign expenses", async () => {
    render(<ExpensePanel tripId="trip-1" userId="user-1" currency="MXN" canEdit />);

    await screen.findByRole("button", { name: /Add expense/ });
    fireEvent.click(screen.getByRole("button", { name: /Add expense/ }));

    // Switch the expense currency to USD (foreign vs. the MXN trip base).
    fireEvent.change(screen.getByLabelText("Currency"), { target: { value: "USD" } });

    // Read-only rate label: 1 USD = 17.2 MXN (correct direction, no manual entry).
    expect(screen.getByText(/1 USD = 17\.2 MXN/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/Amount \(USD\)/), { target: { value: "20" } });

    // 20 USD ≈ 344 MXN (live read-only conversion).
    expect(await screen.findByText(/344\.00/)).toBeTruthy();
  });

  it("defaults the currency to the event location's currency", async () => {
    render(<ExpensePanel tripId="trip-1" userId="user-1" currency="USD" locationCurrency="MXN" canEdit />);

    await screen.findByRole("button", { name: /Add expense/ });
    fireEvent.click(screen.getByRole("button", { name: /Add expense/ }));

    // New expense currency defaults to the location currency (MXN), not base USD.
    expect((screen.getByLabelText("Currency") as HTMLSelectElement).value).toBe("MXN");
  });

  it("only shows paid-by/method/participants when splitting is on", async () => {
    render(<ExpensePanel tripId="trip-1" userId="user-1" currency="USD" canEdit />);

    await screen.findByRole("button", { name: /Add expense/ });
    fireEvent.click(screen.getByRole("button", { name: /Add expense/ }));

    // Off by default → paid-by/method/participants hidden.
    expect(screen.queryByLabelText("Paid by")).toBeNull();
    expect(screen.queryByLabelText("Split method")).toBeNull();
    expect(screen.queryByText("Participants")).toBeNull();

    // Turn splitting on → they appear.
    fireEvent.click(screen.getByLabelText("Split this expense"));
    expect(screen.getByLabelText("Paid by")).toBeTruthy();
    expect(screen.getByLabelText("Split method")).toBeTruthy();
    expect(screen.getByText("Participants")).toBeTruthy();

    // Turn it off again → they hide.
    fireEvent.click(screen.getByLabelText("Split this expense"));
    expect(screen.queryByLabelText("Paid by")).toBeNull();
    expect(screen.queryByLabelText("Split method")).toBeNull();
    expect(screen.queryByText("Participants")).toBeNull();
  });
});
