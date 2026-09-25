import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SettlementView } from "@/features/expenses/components/settlement-view";
import { collaborationRepository } from "@/features/collaboration/data/dexie-collaboration-repository";
import { useTripBalances } from "@/features/expenses/lib/use-trip-balances";
import { useLocalProfile } from "@/features/profile/lib/use-local-profile";

vi.mock("@/features/expenses/lib/use-trip-balances", () => ({
  useTripBalances: vi.fn(),
}));
vi.mock("@/features/collaboration/data/dexie-collaboration-repository", () => ({
  collaborationRepository: { listProfiles: vi.fn() },
}));
vi.mock("@/features/profile/lib/use-local-profile", () => ({
  useLocalProfile: vi.fn(),
}));
vi.mock("@/features/expenses/components/settle-up-sheet", () => ({
  SettleUpSheet: (props: { open: boolean; payerName: string; receiverName: string }) =>
    props.open ? <div data-testid="settle-up-sheet">{props.payerName} → {props.receiverName}</div> : null,
}));

const payerId = "11111111-1111-4111-8111-111111111111";
const receiverId = "22222222-2222-4222-8222-222222222222";

describe("SettlementView", () => {
  beforeEach(() => {
    vi.mocked(useTripBalances).mockReturnValue({
      loading: false,
      balances: { [receiverId]: 4250n, [payerId]: -4250n, "user-3": -100n },
      pairwiseDebts: [{ payerId, receiverId, amountMinor: 4250n, currency: "USD" }],
      transfers: [{ fromUserId: payerId, toUserId: receiverId, amountMinor: 4250n, currency: "USD" }],
      members: [
        { id: "member-1", tripId: "trip-1", userId: receiverId, role: "owner", invitedBy: null, joinedAt: "2026-01-01T00:00:00Z", roleChangedAt: null, roleChangedBy: null, removedAt: null, removedBy: null, version: 1, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
        { id: "member-2", tripId: "trip-1", userId: payerId, role: "editor", invitedBy: null, joinedAt: "2026-01-01T00:00:00Z", roleChangedAt: null, roleChangedBy: null, removedAt: null, removedBy: null, version: 1, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
      ],
      settlements: [],
    });
    vi.mocked(useLocalProfile).mockReturnValue({
      id: receiverId,
      fullName: "Abimael Garcia",
      avatarUrl: "https://example.com/abimael.png",
      avatarSeed: "adventurer|abimael",
      phone: null,
      emergencyContactName: null,
      emergencyContactRelationship: null,
      emergencyContactPhone: null,
      passportIssuingCountry: null,
      passportExpiresOn: null,
      updatedAt: "2026-01-01T00:00:00Z",
    });
    vi.mocked(collaborationRepository.listProfiles).mockResolvedValue([
      { id: payerId, fullName: "Mika Sato", avatarUrl: "https://example.com/mika.png", avatarSeed: "adventurer|mika", email: null },
    ]);
  });

  afterEach(() => cleanup());

  it("uses local and authorized names with Traveler fallback and renders avatars", async () => {
    render(<SettlementView tripId="trip-1" userId={receiverId} currency="USD" />);

    await waitFor(() => expect(screen.getAllByText("Mika Sato").length).toBeGreaterThan(0));
    expect(screen.getAllByText("Abimael Garcia").length).toBeGreaterThan(0);
    expect(screen.getByText("Traveler")).toBeTruthy();
    expect(screen.getByText("owes")).toBeTruthy();
    expect(screen.getByText("$42.50 USD")).toBeTruthy();
    expect(screen.queryByText(payerId)).toBeNull();
    expect(document.querySelector('img[src="https://example.com/mika.png"]')).toBeTruthy();
    expect(document.querySelector('img[src="https://example.com/abimael.png"]')).toBeTruthy();
  });

  it("opens Settle Up prefilled for a pairwise member debt", async () => {
    render(<SettlementView tripId="trip-1" userId={receiverId} currency="USD" />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Settle Up" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Settle Up" }));
    expect(screen.getByTestId("settle-up-sheet").textContent).toContain("Mika Sato");
    expect(screen.getByTestId("settle-up-sheet").textContent).toContain("Abimael Garcia");
  });
});
