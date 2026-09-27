import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider, Toaster } from "@/components/ui/toast";
import type { Expense, TripMember } from "@/features/domain/entities";
import { ExpenseFormSheet } from "@/features/expenses/components/expense-form-sheet";
import { expenseRepository } from "@/features/expenses/data/dexie-expense-repository";
import { resolveExchangeRate } from "@/features/finance/lib/exchange-rate-service";

if (typeof window !== "undefined") {
  window.matchMedia ??= () =>
    ({
      matches: false,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

vi.mock("@/features/expenses/data/dexie-expense-repository", () => ({
  expenseRepository: {
    watchByTrip: vi.fn((_tripId: string, cb: (expenses: unknown[]) => void) => {
      cb([]);
      return () => {};
    }),
    listSharesByExpense: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: "expense-1" }),
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

vi.mock("@/features/finance/lib/exchange-rate-service", () => ({
  resolveExchangeRate: vi.fn(),
}));

vi.mock("@/features/contacts/data/dexie-contact-repository", () => ({
  contactRepository: {
    create: vi.fn(),
  },
  tripTravelerRepository: {
    watch: vi.fn((_tripId: string, cb: (travelers: unknown[]) => void) => {
      cb([]);
      return () => {};
    }),
    attach: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  if (typeof crypto !== "undefined" && !crypto.randomUUID) {
    (crypto as { randomUUID?: () => string }).randomUUID = () => "test-uuid";
  }
});

afterEach(() => cleanup());

describe("ExpenseFormSheet", () => {
  it("prefills handoff fields and writes activityId on create", async () => {
    render(
      <ExpenseFormSheet
        open
        tripId="trip-1"
        userId="user-1"
        currency="USD"
        initialData={{
          activityId: "activity-1",
          description: "Pagar estacionamiento",
          date: "2026-09-23",
          category: "transport",
        }}
        onClose={vi.fn()}
        onError={vi.fn()}
      />,
    );

    expect((screen.getByLabelText("Description") as HTMLInputElement).value).toBe("Pagar estacionamiento");
    expect((screen.getByLabelText("Date") as HTMLInputElement).value).toBe("2026-09-23");
    expect((screen.getByLabelText("Category") as HTMLSelectElement).value).toBe("transport");

    fireEvent.change(screen.getByLabelText(/Amount \(USD\)/), { target: { value: "4.50" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save expense" }));
      await Promise.resolve();
    });

    await waitFor(() => expect(expenseRepository.create).toHaveBeenCalled());
    expect(vi.mocked(expenseRepository.create).mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        tripId: "trip-1",
        activityId: "activity-1",
        description: "Pagar estacionamiento",
        date: "2026-09-23",
        category: "transport",
      }),
    );
  });

  it("locks a live rate on create and does not warn", async () => {
    vi.mocked(resolveExchangeRate).mockResolvedValue({
      rate: 0.055,
      source: "live",
      fetchedAt: "2026-09-27T12:00:00.000Z",
    });

    renderSheet();
    fireEvent.change(screen.getByLabelText("Currency"), { target: { value: "MXN" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Tacos" } });
    fireEvent.change(screen.getByLabelText(/Amount \(MXN\)/), { target: { value: "200.00" } });

    await waitFor(() =>
      expect((screen.getByRole("button", { name: "Save expense" }) as HTMLButtonElement).disabled).toBe(false),
    );
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText(/1 MXN = 0\.055 USD/)).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save expense" }));
      await Promise.resolve();
    });

    await waitFor(() => expect(expenseRepository.create).toHaveBeenCalled());
    expect(vi.mocked(expenseRepository.create).mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ currency: "MXN", exchangeRateToBase: 0.055 }),
    );
    expect(screen.queryByText("Cached exchange rate applied")).toBeNull();
  });

  it("warns and locks a cached rate when the fetch falls back", async () => {
    vi.mocked(resolveExchangeRate).mockResolvedValue({
      rate: 0.051,
      source: "cache",
      fetchedAt: "2026-09-26T15:00:00.000Z",
    });

    renderSheet();
    fireEvent.change(screen.getByLabelText("Currency"), { target: { value: "MXN" } });

    const warning = await screen.findByRole("status");
    expect(warning.textContent).toContain("Saved with a cached rate from 2026-09-26");
    expect(warning.textContent).toContain("Balances will keep this rate after you reconnect.");

    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Taxi" } });
    fireEvent.change(screen.getByLabelText(/Amount \(MXN\)/), { target: { value: "100.00" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save expense" }));
      await Promise.resolve();
    });

    await waitFor(() => expect(expenseRepository.create).toHaveBeenCalled());
    expect(vi.mocked(expenseRepository.create).mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ currency: "MXN", exchangeRateToBase: 0.051 }),
    );
    expect(await screen.findByText("Cached exchange rate applied (0.051).")).toBeTruthy();
  });

  it("warns when the built-in default rate is locked", async () => {
    vi.mocked(resolveExchangeRate).mockResolvedValue({
      rate: 0.0581,
      source: "default",
      fetchedAt: "2026-09-27T12:00:00.000Z",
    });

    renderSheet();
    fireEvent.change(screen.getByLabelText("Currency"), { target: { value: "MXN" } });

    const warning = await screen.findByRole("status");
    expect(warning.textContent).toContain("Saved with a built-in exchange rate.");
    expect(warning.textContent).toContain("Balances will keep this rate after you reconnect.");
  });

  it("does not overwrite a historical rate when an existing expense is edited", async () => {
    vi.mocked(resolveExchangeRate).mockResolvedValue({
      rate: 0.099,
      source: "live",
      fetchedAt: "2026-09-27T12:00:00.000Z",
    });
    vi.mocked(expenseRepository.update).mockResolvedValue(historicalExpense);

    renderSheet(historicalExpense);

    expect(screen.getByText(/1 MXN = 0\.05 USD/)).toBeTruthy();
    expect(screen.queryByText(/0\.099/)).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(resolveExchangeRate).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save expense" }));
      await Promise.resolve();
    });

    await waitFor(() => expect(expenseRepository.update).toHaveBeenCalled());
    expect(vi.mocked(expenseRepository.update).mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ currency: "MXN", exchangeRateToBase: 0.05 }),
    );
    expect(screen.queryByText("Cached exchange rate applied")).toBeNull();
  });
});

const historicalExpense: Expense = {
  id: "expense-1",
  tripId: "trip-1",
  activityId: null,
  description: "Tacos",
  amountMinor: 20000n,
  currency: "MXN",
  exchangeRateToBase: 0.05,
  paidBy: "user-1",
  splitType: "equal",
  category: null,
  subcategory: null,
  date: "2026-09-20",
  createdBy: "user-1",
  createdAt: "2026-09-20T00:00:00.000Z",
  updatedAt: "2026-09-20T00:00:00.000Z",
  deletedAt: null,
};

function renderSheet(expense?: Expense) {
  return render(
    <ToastProvider>
      <ExpenseFormSheet
        open
        expense={expense}
        tripId="trip-1"
        userId="user-1"
        currency="USD"
        onClose={vi.fn()}
        onError={vi.fn()}
      />
      <Toaster />
    </ToastProvider>,
  );
}
