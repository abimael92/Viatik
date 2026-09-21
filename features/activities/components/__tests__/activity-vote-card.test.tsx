import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ActivityVoteCard } from "@/features/activities/components/activity-vote-card";
import type { Activity } from "@/features/domain/entities";
import { activityRepository } from "@/features/activities/data/dexie-activity-repository";
import { useLocalProfile } from "@/features/profile/lib/use-local-profile";
import { collaborationRepository } from "@/features/collaboration/data/dexie-collaboration-repository";

vi.mock("@/features/activities/data/dexie-activity-repository", () => ({
  activityRepository: { update: vi.fn().mockResolvedValue(undefined), cancelProposal: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/features/profile/lib/use-local-profile", () => ({ useLocalProfile: vi.fn(() => null) }));
vi.mock("@/features/collaboration/data/dexie-collaboration-repository", () => ({
  collaborationRepository: { listProfiles: vi.fn().mockResolvedValue([]) },
}));

const timestamp = "2026-09-15T12:00:00.000Z";
const activity: Activity = {
  id: "activity-1",
  tripId: "trip-1",
  dayDate: "2026-09-16",
  title: "Museum",
  description: null,
  category: "sightseeing",
  startTime: "2026-09-16T10:00:00",
  endTime: "2026-09-16T12:00:00",
  position: 1,
  estimatedCostMinor: null,
  participants: [{ userId: "user-1", status: "attending" }],
  pollStatus: "proposed",
  votingEndsAt: "2099-09-16T18:00:00.000Z",
  pollOptions: [{ id: "option-1", label: "Museum", proposedBy: "user-2", createdAt: timestamp }],
  pollVotes: [{ userId: "user-2", choice: "approve", optionId: "option-1", createdAt: timestamp, updatedAt: timestamp }],
  createdBy: "user-2",
  createdAt: timestamp,
  updatedAt: timestamp,
  deletedAt: null,
};

describe("ActivityVoteCard", () => {
  beforeEach(() => {
    vi.mocked(useLocalProfile).mockReset().mockReturnValue(null);
    vi.mocked(collaborationRepository.listProfiles).mockReset().mockResolvedValue([]);
  });

  it("shows proposal status, voter avatars, and casts approval", async () => {
    const { container } = render(<ActivityVoteCard activity={activity} currentUserId="user-1" eligibleViaticUsers={2} profiles={[{ id: "user-2", fullName: "Mika Sato", avatarUrl: "https://example.com/mika.png", avatarSeed: "adventurer|mika", email: null }]} />);
    expect(screen.getByText("Pending group approval")).toBeTruthy();
    expect(screen.getByText("Current plan: Museum")).toBeTruthy();
    expect(container.querySelector('img[src="https://example.com/mika.png"]')).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(activityRepository.update).toHaveBeenCalledWith("activity-1", expect.objectContaining({
      pollStatus: "approved",
      pollVotes: expect.arrayContaining([expect.objectContaining({ userId: "user-1", choice: "approve", optionId: "option-1" })]),
    })));
  });

  it("uses the current user's configured avatar when remote voter data is stale", async () => {
    vi.mocked(useLocalProfile).mockReturnValue({
      id: "user-2",
      fullName: "Abimael Garcia",
      avatarUrl: "https://example.com/configured.png",
      avatarSeed: "adventurer|configured",
      phone: null,
      emergencyContactName: null,
      emergencyContactRelationship: null,
      emergencyContactPhone: null,
      passportIssuingCountry: null,
      passportExpiresOn: null,
      updatedAt: timestamp,
    });
    vi.mocked(collaborationRepository.listProfiles).mockResolvedValueOnce([
      { id: "user-2", fullName: "Abimael Garcia", avatarUrl: "https://example.com/stale.png", avatarSeed: "adventurer|stale", email: null },
    ]);

    render(<ActivityVoteCard activity={activity} currentUserId="user-2" eligibleViaticUsers={2} />);

    await waitFor(() => expect(document.querySelector('img[src="https://example.com/configured.png"]')).toBeTruthy());
    expect(document.querySelector('img[src="https://example.com/stale.png"]')).toBeNull();
  });

  it("uses initials instead of a generated avatar when the account has no avatar set", () => {
    render(<ActivityVoteCard activity={activity} currentUserId="user-1" eligibleViaticUsers={2} profiles={[{ id: "user-2", fullName: "Abimael Garcia", avatarUrl: null, avatarSeed: null, email: null }]} />);
    expect(screen.getByText("AG")).toBeTruthy();
  });

  it("lets only the proposal creator cancel the suggestion", async () => {
    render(<ActivityVoteCard activity={activity} currentUserId="user-2" eligibleViaticUsers={2} />);
    const cancel = screen.getByRole("button", { name: "Cancel suggestion" });
    expect(cancel).toBeTruthy();
    fireEvent.click(cancel);
    await waitFor(() => expect(activityRepository.cancelProposal).toHaveBeenCalledWith("activity-1"));
  });

  it("does not show cancellation to another voter", () => {
    render(<ActivityVoteCard activity={activity} currentUserId="user-1" eligibleViaticUsers={2} />);
    expect(screen.queryByRole("button", { name: "Cancel suggestion" })).toBeNull();
  });

  it("disables voting when fewer than two Viatik users are eligible", () => {
    render(<ActivityVoteCard activity={activity} currentUserId="user-1" eligibleViaticUsers={1} />);
    const approve = screen.getByRole("button", { name: "Approve" });
    expect((approve as HTMLButtonElement).disabled).toBe(true);
    expect(approve.parentElement?.getAttribute("title")).toBe("Requires at least 2 Viatik users");
  });

  it("adds and votes for a suggested alternative", async () => {
    render(<ActivityVoteCard activity={activity} currentUserId="user-1" eligibleViaticUsers={2} />);
    fireEvent.click(screen.getByRole("button", { name: "Suggest alternative" }));
    fireEvent.change(screen.getByLabelText("Alternative"), { target: { value: "Gallery" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit alternative" }));
    await waitFor(() => expect(activityRepository.update).toHaveBeenCalledWith("activity-1", expect.objectContaining({
      pollOptions: expect.arrayContaining([expect.objectContaining({ label: "Gallery", proposedBy: "user-1" })]),
      pollVotes: expect.arrayContaining([expect.objectContaining({ userId: "user-1", choice: "suggested" })]),
    })));
  });
});
