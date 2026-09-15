import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ActivityVoteCard } from "@/features/activities/components/activity-vote-card";
import type { Activity } from "@/features/domain/entities";
import { activityRepository } from "@/features/activities/data/dexie-activity-repository";

vi.mock("@/features/activities/data/dexie-activity-repository", () => ({
  activityRepository: { update: vi.fn().mockResolvedValue(undefined) },
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
  it("shows proposal status, voter avatars, and casts approval", async () => {
    render(<ActivityVoteCard activity={activity} currentUserId="user-1" />);
    expect(screen.getByText("Pending group approval")).toBeTruthy();
    expect(screen.getByText("Current plan: Museum")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(activityRepository.update).toHaveBeenCalledWith("activity-1", expect.objectContaining({
      pollStatus: "voting",
      pollVotes: expect.arrayContaining([expect.objectContaining({ userId: "user-1", choice: "approve", optionId: "option-1" })]),
    })));
  });

  it("adds and votes for a suggested alternative", async () => {
    render(<ActivityVoteCard activity={activity} currentUserId="user-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Suggest alternative" }));
    fireEvent.change(screen.getByLabelText("Alternative"), { target: { value: "Gallery" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit alternative" }));
    await waitFor(() => expect(activityRepository.update).toHaveBeenCalledWith("activity-1", expect.objectContaining({
      pollOptions: expect.arrayContaining([expect.objectContaining({ label: "Gallery", proposedBy: "user-1" })]),
      pollVotes: expect.arrayContaining([expect.objectContaining({ userId: "user-1", choice: "suggested" })]),
    })));
  });
});
