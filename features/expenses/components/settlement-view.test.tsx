import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SettlementView } from "@/features/expenses/components/settlement-view";
import { collaborationRepository } from "@/features/collaboration/data/dexie-collaboration-repository";
import { useSettlement } from "@/features/expenses/lib/use-settlement";
import { useLocalProfile } from "@/features/profile/lib/use-local-profile";

vi.mock("@/features/expenses/lib/use-settlement", () => ({
  useSettlement: vi.fn(),
}));
vi.mock("@/features/collaboration/data/dexie-collaboration-repository", () => ({
  collaborationRepository: { listProfiles: vi.fn() },
}));
vi.mock("@/features/profile/lib/use-local-profile", () => ({
  useLocalProfile: vi.fn(),
}));

describe("SettlementView", () => {
  beforeEach(() => {
    vi.mocked(useSettlement).mockReturnValue({
      loading: false,
      balances: { "user-1": 4250n, "user-2": -4250n, "user-3": -100n },
      transfers: [{ fromUserId: "user-2", toUserId: "user-1", amountMinor: 4250n, currency: "USD" }],
      members: [
        { id: "member-1", tripId: "trip-1", userId: "user-1", role: "owner", invitedBy: null, joinedAt: "2026-01-01T00:00:00Z", roleChangedAt: null, roleChangedBy: null, removedAt: null, removedBy: null, version: 1, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
        { id: "member-2", tripId: "trip-1", userId: "user-2", role: "editor", invitedBy: null, joinedAt: "2026-01-01T00:00:00Z", roleChangedAt: null, roleChangedBy: null, removedAt: null, removedBy: null, version: 1, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
      ],
    });
    vi.mocked(useLocalProfile).mockReturnValue({
      id: "user-1",
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
      { id: "user-2", fullName: "Mika Sato", avatarUrl: "https://example.com/mika.png", avatarSeed: "adventurer|mika", email: null },
    ]);
  });

  afterEach(() => cleanup());

  it("uses local and authorized names with Traveler fallback and renders avatars", async () => {
    render(<SettlementView tripId="trip-1" userId="user-1" currency="USD" />);

    await waitFor(() => expect(screen.getAllByText("Mika Sato").length).toBeGreaterThan(0));
    expect(screen.getAllByText("Abimael Garcia").length).toBeGreaterThan(0);
    expect(screen.getByText("Traveler")).toBeTruthy();
    expect(screen.getByText("owes")).toBeTruthy();
    expect(screen.getByText("$42.50 USD")).toBeTruthy();
    expect(screen.queryByText("user-2")).toBeNull();
    expect(document.querySelector('img[src="https://example.com/mika.png"]')).toBeTruthy();
    expect(document.querySelector('img[src="https://example.com/abimael.png"]')).toBeTruthy();
  });
});
