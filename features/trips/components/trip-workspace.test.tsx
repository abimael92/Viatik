import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Activity, ActivityPersonalBudget, Trip, TripMember } from "@/features/domain/entities";
import { activityPersonalBudgetRepository } from "@/features/activities/data/dexie-activity-personal-budget-repository";
import { activityRepository } from "@/features/activities/data/dexie-activity-repository";
import { collaborationRepository } from "@/features/collaboration/data/dexie-collaboration-repository";
import { contactRepository, tripTravelerRepository } from "@/features/contacts/data/dexie-contact-repository";
import { mediaRepository } from "@/features/media/data/dexie-media-repository";
import { tripRepository } from "@/features/trips/data/dexie-trip-repository";
import { weatherRepository } from "@/features/weather/data/dexie-weather-repository";
import { I18nProvider } from "@/lib/i18n/i18n-provider";
import { TripWorkspace } from "@/features/trips/components/trip-workspace";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/features/activities/data/dexie-activity-personal-budget-repository", () => ({
  activityPersonalBudgetRepository: {
    getByActivityAndUser: vi.fn(),
    upsert: vi.fn(),
    remove: vi.fn(),
  },
}));
vi.mock("@/features/activities/data/dexie-activity-repository", () => ({
  activityRepository: {
    watchByTrip: vi.fn(),
    remove: vi.fn(),
  },
}));
vi.mock("@/features/collaboration/data/dexie-collaboration-repository", () => ({
  collaborationRepository: {
    watchMembers: vi.fn(),
    listProfiles: vi.fn(),
  },
}));
vi.mock("@/features/contacts/data/dexie-contact-repository", () => ({
  contactRepository: { watch: vi.fn() },
  tripTravelerRepository: { watch: vi.fn() },
}));
vi.mock("@/features/media/data/dexie-media-repository", () => ({
  mediaRepository: { watchByTrip: vi.fn() },
  mediaPayload: vi.fn(() => ({})),
}));
vi.mock("@/features/trips/data/dexie-trip-repository", () => ({
  tripRepository: {
    watchById: vi.fn(),
    remove: vi.fn(),
  },
}));
vi.mock("@/features/weather/data/dexie-weather-repository", () => ({
  weatherRepository: { watchForecast: vi.fn() },
}));
vi.mock("@/features/weather/lib/load-trip-weather-forecast", () => ({
  loadTripWeatherForecast: vi.fn(async () => null),
}));
vi.mock("@/lib/sync/use-sync-status", () => ({
  useSyncStatus: () => ({
    status: "idle",
    pending: 0,
    retryablePending: 0,
    lastSyncAt: null,
    lastError: null,
    isOnline: true,
    conflicts: 0,
  }),
}));
vi.mock("@/features/trips/components/trip-tasks-board", () => ({
  TripTasksBoard: () => null,
}));
vi.mock("@/features/activities/components/activity-form", () => ({
  ActivityForm: ({ personalBudgetMinor }: { personalBudgetMinor: bigint | null }) => (
    <div data-testid="activity-form" data-personal-budget={personalBudgetMinor?.toString() ?? ""} />
  ),
  ActivityCloneHeaderButton: () => null,
}));
vi.mock("@/features/activities/components/activity-clone-dialog", () => ({
  ActivityCloneDialog: () => null,
}));

const trip = {
  id: "trip-1",
  ownerId: "user-1",
  name: "Lisbon",
  description: null,
  destination: "Lisbon",
  latitude: null,
  longitude: null,
  placeId: null,
  timeZone: null,
  startDate: "2030-09-15",
  endDate: "2030-09-22",
  status: "planned",
  startedAt: null,
  completedAt: null,
  cancelledAt: null,
  coverImageUrl: null,
  adultCount: 1,
  childCount: 0,
  baseCurrency: "USD",
  createdBy: "user-1",
  updatedBy: "user-1",
  deletedBy: null,
  restoredAt: null,
  restoredBy: null,
  statusChangedAt: "2026-01-01T00:00:00Z",
  statusChangedBy: "user-1",
  version: 1,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  deletedAt: null,
} satisfies Trip;

const activity = {
  id: "activity-1",
  tripId: trip.id,
  dayDate: "2030-09-16",
  title: "Visit the museum",
  description: null,
  placeName: null,
  formattedAddress: null,
  placeId: null,
  category: "sightseeing",
  timingSpecificity: "exact",
  flexiblePeriod: null,
  startTime: null,
  endTime: null,
  bookingReference: null,
  participants: [],
  pollStatus: "confirmed",
  votingEndsAt: null,
  pollOptions: [],
  pollVotes: [],
  attachments: [],
  checklist: [],
  position: 0,
  estimatedCostMinor: null,
  createdBy: "user-1",
  updatedBy: "user-1",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  deletedAt: null,
} satisfies Activity;

describe("TripWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tripRepository.watchById).mockImplementation((_tripId, onChange) => {
      onChange(trip);
      return () => undefined;
    });
    vi.mocked(activityRepository.watchByTrip).mockImplementation((_tripId, onChange) => {
      onChange([activity]);
      return () => undefined;
    });
    vi.mocked(collaborationRepository.watchMembers).mockImplementation((_tripId, onChange) => {
      onChange([
        {
          id: "member-1",
          tripId: trip.id,
          userId: "user-1",
          role: "owner",
          viatikId: null,
          invitedBy: null,
          joinedAt: "2026-01-01T00:00:00Z",
          roleChangedAt: null,
          roleChangedBy: null,
          removedAt: null,
          removedBy: null,
          version: 1,
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        } satisfies TripMember,
      ]);
      return () => undefined;
    });
    vi.mocked(collaborationRepository.listProfiles).mockResolvedValue([]);
    vi.mocked(tripTravelerRepository.watch).mockReturnValue(() => undefined);
    vi.mocked(mediaRepository.watchByTrip).mockReturnValue(() => undefined);
    vi.mocked(weatherRepository.watchForecast).mockReturnValue(() => undefined);
    vi.mocked(contactRepository.watch).mockReturnValue(() => undefined);
  });

  afterEach(() => cleanup());

  it("shows a workspace alert and keeps the activity budget empty when its lookup rejects", async () => {
    vi.mocked(activityPersonalBudgetRepository.getByActivityAndUser).mockRejectedValue(
      new Error("Personal budget lookup failed"),
    );

    render(
      <I18nProvider>
        <TripWorkspace
          tripId={trip.id}
          userId="user-1"
          initialTab="tasks"
          initialAction="edit-activity"
          initialActivityId={activity.id}
        />
      </I18nProvider>,
    );

    expect((await screen.findByTestId("activity-form")).getAttribute("data-personal-budget")).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Personal budget lookup failed",
    );
  });

  it("ignores a rejected budget lookup after the workspace effect becomes stale", async () => {
    let rejectOldLookup!: (cause: Error) => void;
    let resolveNewLookup!: (budget: ActivityPersonalBudget | undefined) => void;
    vi.mocked(activityPersonalBudgetRepository.getByActivityAndUser)
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectOldLookup = reject;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveNewLookup = resolve;
          }),
      );

    const { rerender } = render(
      <I18nProvider>
        <TripWorkspace
          tripId={trip.id}
          userId="user-1"
          initialTab="tasks"
          initialAction="edit-activity"
          initialActivityId={activity.id}
        />
      </I18nProvider>,
    );
    await waitFor(() =>
      expect(activityPersonalBudgetRepository.getByActivityAndUser).toHaveBeenCalledTimes(1),
    );

    rerender(
      <I18nProvider>
        <TripWorkspace
          tripId={trip.id}
          userId="user-2"
          initialTab="tasks"
          initialAction="edit-activity"
          initialActivityId={activity.id}
        />
      </I18nProvider>,
    );
    await waitFor(() =>
      expect(activityPersonalBudgetRepository.getByActivityAndUser).toHaveBeenCalledTimes(2),
    );

    await act(async () => {
      rejectOldLookup(new Error("Stale personal budget lookup failed"));
      resolveNewLookup(undefined);
    });
    expect(await screen.findByTestId("activity-form")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});
