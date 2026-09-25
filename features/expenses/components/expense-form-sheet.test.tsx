import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TripMember } from "@/features/domain/entities";
import { ExpenseFormSheet } from "@/features/expenses/components/expense-form-sheet";
import { expenseRepository } from "@/features/expenses/data/dexie-expense-repository";

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
});
