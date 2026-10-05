import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SharedTripFeed } from "@/features/feed/components/shared-trip-feed";
import { collaborationRepository } from "@/features/collaboration/data/dexie-collaboration-repository";
import { feedRepository } from "@/features/feed/data/dexie-feed-repository";
import { useLocalProfile } from "@/features/profile/lib/use-local-profile";

vi.mock("@/features/feed/data/dexie-feed-repository", () => ({
  feedRepository: { watchByTrip: vi.fn() },
}));
vi.mock("@/features/collaboration/data/dexie-collaboration-repository", () => ({
  collaborationRepository: { listProfiles: vi.fn().mockResolvedValue([]) },
}));
vi.mock("@/features/profile/lib/use-local-profile", () => ({
  useLocalProfile: vi.fn(),
}));

describe("SharedTripFeed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(feedRepository.watchByTrip).mockImplementation((_tripId, onChange) => {
      onChange([
        {
          id: "feed-1",
          tripId: "trip-1",
          actorId: "user-1",
          verb: "added_expense",
          entityType: "expense",
          entityId: "expense-1",
          summary: "added expense “dinner” for $34.00",
          metadata: {},
          createdAt: "2026-09-21T12:00:00.000Z",
        },
      ]);
      return () => undefined;
    });
    vi.mocked(useLocalProfile).mockReturnValue({
      id: "user-1",
      fullName: "Abimael Garcia",
      avatarUrl: "https://example.com/settings-avatar.png",
      avatarSeed: "adventurer|settings-avatar",
      phone: null,
      emergencyContactName: null,
      emergencyContactRelationship: null,
      emergencyContactPhone: null,
      passportIssuingCountry: null,
      passportExpiresOn: null,
      updatedAt: "2026-09-21T12:00:00.000Z",
    });
  });

  afterEach(() => cleanup());

  it("renders and refreshes the signed-in user's configured feed avatar", async () => {
    const profile = {
      id: "user-1",
      fullName: "Abimael Garcia",
      avatarUrl: "https://example.com/settings-avatar.png",
      avatarSeed: "adventurer|settings-avatar",
      phone: null,
      emergencyContactName: null,
      emergencyContactRelationship: null,
      emergencyContactPhone: null,
      passportIssuingCountry: null,
      passportExpiresOn: null,
      updatedAt: "2026-09-21T12:00:00.000Z",
    };
    vi.mocked(useLocalProfile).mockReturnValue(profile);
    const { container, rerender } = render(<SharedTripFeed tripId="trip-1" userId="user-1" />);

    expect(await screen.findByText("You")).toBeTruthy();
    expect(container.querySelector('img[src="https://example.com/settings-avatar.png?v=2026-09-21T12%3A00%3A00.000Z"]')).toBeTruthy();

    vi.mocked(useLocalProfile).mockReturnValue({
      ...profile,
      updatedAt: "2026-09-21T13:00:00.000Z",
    });
    rerender(<SharedTripFeed tripId="trip-1" userId="user-1" />);

    expect(container.querySelector('img[src="https://example.com/settings-avatar.png?v=2026-09-21T13%3A00%3A00.000Z"]')).toBeTruthy();
  });

  it("shows initials instead of a generated avatar for a collaborator without one", async () => {
    vi.mocked(feedRepository.watchByTrip).mockImplementation((_tripId, onChange) => {
      onChange([{ id: "feed-2", tripId: "trip-1", actorId: "user-2", verb: "added_expense", entityType: "expense", entityId: "expense-2", summary: "added expense “Tacos”", metadata: {}, createdAt: "2026-09-21T12:00:00.000Z" }]);
      return () => undefined;
    });
    vi.mocked(collaborationRepository.listProfiles).mockResolvedValue([{ id: "user-2", fullName: "Citlalli Abigail", avatarUrl: null, avatarSeed: null, email: null }]);

    const { container } = render(<SharedTripFeed tripId="trip-1" userId="user-1" />);

    expect(await screen.findByText("Citlalli Abigail")).toBeTruthy();
    expect(container.querySelector("ol img")).toBeNull();
    expect(screen.getByText("CA")).toBeTruthy();
  });

  it("starts collapsed and can expand a collapsible feed", async () => {
    render(<SharedTripFeed tripId="trip-1" userId="user-1" collapsible />);

    const toggle = screen.getByRole("button", { name: "Expand trip feed" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("added expense “dinner” for $34.00")).toBeNull();

    fireEvent.click(toggle);

    expect((await screen.findByRole("button", { name: "Collapse trip feed" })).getAttribute("aria-expanded")).toBe("true");
    expect(await screen.findByText("added expense “dinner” for $34.00")).toBeTruthy();
  });
});
