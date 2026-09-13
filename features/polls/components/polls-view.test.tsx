import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Trip } from "@/features/domain/entities";
import type { Poll, PollVote } from "@/features/polls/domain/poll-types";
import { pollRepository } from "@/features/polls/data/dexie-poll-repository";
import { PollsView } from "@/features/polls/components/polls-view";

if (typeof window !== "undefined") {
  window.matchMedia ??= () => ({ matches: false, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as unknown as MediaQueryList;
}

vi.mock("@/features/polls/data/dexie-poll-repository", () => ({
  pollRepository: {
    watchByTrip: vi.fn(),
    watchVotesByPoll: vi.fn(),
    create: vi.fn(),
    castVote: vi.fn(),
    close: vi.fn(),
    markScheduled: vi.fn(),
  },
}));

vi.mock("@/features/activities/data/dexie-activity-repository", () => ({
  activityRepository: { create: vi.fn() },
}));

const trip: Trip = {
  id: "trip-1",
  ownerId: "owner-1",
  name: "Weekend",
  description: null,
  destination: null,
  latitude: null,
  longitude: null,
  placeId: null,
  timeZone: null,
  startDate: "2026-06-01",
  endDate: "2026-06-03",
  status: "planned",
  startedAt: null,
  completedAt: null,
  coverImageUrl: null,
  adultCount: 2,
  childCount: 0,
  baseCurrency: "USD",
  createdBy: "owner-1",
  updatedBy: "owner-1",
  deletedBy: null,
  restoredAt: null,
  restoredBy: null,
  cancelledAt: null,
  statusChangedAt: "2026-01-01T00:00:00Z",
  statusChangedBy: "owner-1",
  version: 1,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  deletedAt: null,
};

const poll: Poll = {
  id: "poll-1",
  tripId: "trip-1",
  question: "Where for dinner?",
  options: [
    { id: "opt-a", pollId: "poll-1", label: "Ramen", position: 0, createdAt: "2026-01-01T00:00:00Z" },
    { id: "opt-b", pollId: "poll-1", label: "Tacos", position: 1, createdAt: "2026-01-01T00:00:00Z" },
  ],
  createdBy: "owner-1",
  status: "active",
  dayDate: null,
  location: null,
  category: null,
  scheduledActivityId: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  deletedAt: null,
};

const votes: PollVote[] = [
  { id: "v1", pollId: "poll-1", optionId: "opt-a", userId: "u1", createdAt: "2026-01-02T00:00:00Z", updatedAt: "2026-01-02T00:00:00Z" },
  { id: "v2", pollId: "poll-1", optionId: "opt-a", userId: "u2", createdAt: "2026-01-02T00:00:00Z", updatedAt: "2026-01-02T00:00:00Z" },
  { id: "v3", pollId: "poll-1", optionId: "opt-b", userId: "u3", createdAt: "2026-01-02T00:00:00Z", updatedAt: "2026-01-02T00:00:00Z" },
];

// Capture the reactive callbacks the component subscribes to so tests can feed
// data in (mimicking live Dexie queries).
const subscriptions: { polls?: (items: Poll[]) => void; votes: Record<string, (items: PollVote[]) => void> } = {
  votes: {},
};

beforeEach(() => {
  vi.clearAllMocks();
  subscriptions.polls = undefined;
  subscriptions.votes = {};

  vi.mocked(pollRepository.watchByTrip).mockImplementation((_tripId, onChange) => {
    subscriptions.polls = onChange;
    return () => {};
  });
  vi.mocked(pollRepository.watchVotesByPoll).mockImplementation((pollId, onChange) => {
    subscriptions.votes[pollId] = onChange;
    return () => {};
  });
});

afterEach(() => cleanup());

describe("PollsView", () => {
  // Feed a poll and its votes through the captured live-query callbacks,
  // wrapping each state update in `act` (React batches async updates).
  async function renderWithData() {
    render(<PollsView tripId="trip-1" userId="u1" canEdit={true} trip={trip} activities={[]} />);
    act(() => subscriptions.polls?.([poll]));
    await screen.findByText("Where for dinner?");
    act(() => subscriptions.votes["poll-1"]?.(votes));
    await screen.findByText("3 votes");
  }

  it("renders an empty state when there are no polls", () => {
    render(<PollsView tripId="trip-1" userId="u1" canEdit={true} trip={trip} activities={[]} />);
    act(() => subscriptions.polls?.([]));
    expect(screen.getByText(/No polls yet/)).toBeTruthy();
  });

  it("renders poll cards with live percentage tallies", async () => {
    await renderWithData();

    expect(screen.getByText("Where for dinner?")).toBeTruthy();
    // 2/3 ≈ 67%, 1/3 ≈ 33%.
    expect(screen.getByText("2 · 67%")).toBeTruthy();
    expect(screen.getByText("1 · 33%")).toBeTruthy();
  });

  it("casts a vote when an option is tapped", async () => {
    await renderWithData();

    const tacoOption = screen.getByRole("button", { name: /Tacos/ });
    fireEvent.click(tacoOption);

    await waitFor(() => {
      expect(pollRepository.castVote).toHaveBeenCalledWith("poll-1", "opt-b", "u1");
    });
  });
});
