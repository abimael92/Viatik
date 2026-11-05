import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MemberPanel } from "@/features/collaboration/member-panel";
import { collaborationRepository } from "@/features/collaboration/data/dexie-collaboration-repository";

vi.mock("@/features/collaboration/data/dexie-collaboration-repository", () => ({
  collaborationRepository: {
    watchMembers: vi.fn(),
    watchInvitations: vi.fn(),
    listProfiles: vi.fn(),
    updateMemberRole: vi.fn(),
    removeMember: vi.fn(),
    revokeInvitation: vi.fn(),
  },
}));

describe("MemberPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(collaborationRepository.watchMembers).mockImplementation((_tripId, onChange) => {
      onChange([
        { id: "owner-1", tripId: "trip-1", userId: "user-1", role: "owner" },
        { id: "member-1", tripId: "trip-1", userId: "user-2", role: "editor" },
      ] as never);
      return () => undefined;
    });
    vi.mocked(collaborationRepository.watchInvitations).mockImplementation((_tripId, onChange) => {
      onChange([
        { id: "invitation-1", tripId: "trip-1", email: "friend@example.com", role: "viewer", status: "pending" },
      ] as never);
      return () => undefined;
    });
    vi.mocked(collaborationRepository.listProfiles).mockResolvedValue([]);
    vi.mocked(collaborationRepository.updateMemberRole).mockRejectedValue(new Error(""));
    vi.mocked(collaborationRepository.removeMember).mockRejectedValue(new Error(""));
    vi.mocked(collaborationRepository.revokeInvitation).mockRejectedValue(new Error(""));
  });

  afterEach(() => cleanup());

  it("shows a localized error when updating a member role fails", async () => {
    render(<MemberPanel tripId="trip-1" userId="user-1" />);
    fireEvent.change(await screen.findByRole("combobox", { name: "Role for user-2" }), {
      target: { value: "viewer" },
    });

    expect((await screen.findByRole("status")).textContent).toContain("Something went wrong. Please try again.");
    expect(collaborationRepository.updateMemberRole).toHaveBeenCalledWith("member-1", "viewer");
  });

  it("shows a localized error when removing a member fails", async () => {
    render(<MemberPanel tripId="trip-1" userId="user-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove member" }));

    expect((await screen.findByRole("status")).textContent).toContain("Something went wrong. Please try again.");
    expect(collaborationRepository.removeMember).toHaveBeenCalledWith("member-1");
  });

  it("shows a localized error when revoking an invitation fails", async () => {
    render(<MemberPanel tripId="trip-1" userId="user-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Revoke" }));

    expect((await screen.findByRole("status")).textContent).toContain("Something went wrong. Please try again.");
    expect(collaborationRepository.revokeInvitation).toHaveBeenCalledWith("invitation-1");
  });
});
