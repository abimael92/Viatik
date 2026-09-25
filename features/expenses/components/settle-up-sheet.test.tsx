import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SettleUpSheet } from "@/features/expenses/components/settle-up-sheet";
import { settlementRepository } from "@/features/expenses/data/dexie-settlement-repository";
import { expenseRepository } from "@/features/expenses/data/dexie-expense-repository";

vi.mock("@/features/expenses/data/dexie-settlement-repository", () => ({
  settlementRepository: { create: vi.fn().mockResolvedValue({ id: "settlement-1" }) },
}));
vi.mock("@/features/expenses/data/dexie-expense-repository", () => ({
  expenseRepository: { update: vi.fn(), create: vi.fn() },
}));

afterEach(() => cleanup());

describe("SettleUpSheet", () => {
  it("logs an independent settlement and never mutates an expense", async () => {
    const onSaved = vi.fn();
    render(
      <SettleUpSheet
        open
        tripId="trip-1"
        userId="11111111-1111-4111-8111-111111111111"
        debt={{
          payerId: "22222222-2222-4222-8222-222222222222",
          receiverId: "11111111-1111-4111-8111-111111111111",
          amountMinor: 5000n,
          currency: "USD",
        }}
        payerName="Traveler B"
        receiverName="Aby"
        onClose={vi.fn()}
        onError={vi.fn()}
        onSaved={onSaved}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Log settlement" }));

    await waitFor(() => expect(settlementRepository.create).toHaveBeenCalledOnce());
    expect(vi.mocked(settlementRepository.create).mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        tripId: "trip-1",
        fromUserId: "22222222-2222-4222-8222-222222222222",
        toUserId: "11111111-1111-4111-8111-111111111111",
        amountMinor: 5000n,
        currency: "USD",
        createdBy: "11111111-1111-4111-8111-111111111111",
      }),
    );
    expect(expenseRepository.update).not.toHaveBeenCalled();
    expect(expenseRepository.create).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledOnce();
  });
});
