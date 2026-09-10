import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Trip, TripMember } from "@/features/domain/entities";
import { TripWorkspace } from "@/features/trips/components/trip-workspace";
import { activityRepository } from "@/features/activities/data/dexie-activity-repository";
import { collaborationRepository } from "@/features/collaboration/data/dexie-collaboration-repository";
import { mediaRepository } from "@/features/media/data/dexie-media-repository";
import { tripRepository } from "@/features/trips/data/dexie-trip-repository";
import { weatherRepository } from "@/features/weather/data/dexie-weather-repository";

if (typeof window !== "undefined") {
  window.matchMedia ??= (() => ({
    matches: false,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// A stub that records how AiScoutSidebar is mounted so tests can assert the
// itinerary button mounts it embedded and the overview quick-action mounts it
// as a modal, without exercising the real drawer's data flow.
vi.mock("@/features/ai/components/ai-scout-sidebar", () => ({
  AiScoutSidebar: (props: { open?: boolean; embedded?: boolean; modal?: boolean }) => {
    // The real modal is gated on `open` (AnimatePresence); the embedded variant
    // is always mounted and visibility is controlled by the parent layout.
    if (props.modal && !props.open) return null;
    return (
      <div
        data-testid="ai-scout-sidebar"
        data-embedded={props.embedded ? "true" : "false"}
        data-modal={props.modal ? "true" : "false"}
        data-open={props.open ? "true" : "false"}
      >
        Scout Sidebar Stub
      </div>
    );
  },
}));

vi.mock("@/features/trips/data/dexie-trip-repository", () => ({
  tripRepository: { watchById: vi.fn(), remove: vi.fn() },
}));
vi.mock("@/features/activities/data/dexie-activity-repository", () => ({
  activityRepository: { watchByTrip: vi.fn(), create: vi.fn(), remove: vi.fn(), restore: vi.fn() },
}));
vi.mock("@/features/collaboration/data/dexie-collaboration-repository", () => ({
  collaborationRepository: { watchMembers: vi.fn() },
}));
vi.mock("@/features/media/data/dexie-media-repository", () => ({
  mediaRepository: { watchByTrip: vi.fn() },
  // Re-exported by lib/sync/cloud-sync.ts as part of __cloudSyncInternals.
  mediaPayload: vi.fn(),
}));
vi.mock("@/features/weather/data/dexie-weather-repository", () => ({
  weatherRepository: { watchForecast: vi.fn() },
}));
vi.mock("@/features/weather/lib/load-trip-weather-forecast", () => ({
  loadTripWeatherForecast: vi.fn().mockResolvedValue({ status: "missing", error: "Set dates." }),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
// next/image is a Next integration; in jsdom a plain element carrying the same
// props is sufficient and avoids the no-img-element / alt-text lint rules.
vi.mock("next/image", () => ({ default: (props: Record<string, unknown>) => <div {...props} /> }));

// Heavy itinerary subviews bring dnd-kit / motion deps that aren't relevant to
// verifying the Scout button integration, so stub them out.
vi.mock("@/features/activities/components/week-calendar", () => ({
  WeekCalendar: () => <div>Week Calendar Stub</div>,
}));
vi.mock("@/features/activities/components/itinerary-board", () => ({
  ItineraryBoard: () => <div>Itinerary Board Stub</div>,
}));

const trip: Trip = {
  id: "trip-1",
  ownerId: "user-1",
  name: "Weekend",
  description: null,
  destination: "Rome",
  latitude: null,
  longitude: null,
  placeId: null,
  timeZone: null,
  startDate: "2026-06-01",
  endDate: "2026-06-03",
  coverImageUrl: null,
  adultCount: 2,
  childCount: 0,
  baseCurrency: "USD",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  deletedAt: null,
};

const ownerMember: TripMember = {
  id: "member-1",
  tripId: "trip-1",
  userId: "user-1",
  role: "owner",
  invitedBy: null,
  joinedAt: "2026-01-01T00:00:00Z",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

async function mountWorkspace(initialTab = "itinerary") {
  vi.mocked(tripRepository.watchById).mockImplementation((_id, cb) => {
    cb(trip);
    return () => undefined;
  });
  vi.mocked(activityRepository.watchByTrip).mockImplementation((_id, cb) => {
    cb([]);
    return () => undefined;
  });
  vi.mocked(collaborationRepository.watchMembers).mockImplementation((_id, cb) => {
    cb([ownerMember]);
    return () => undefined;
  });
  vi.mocked(mediaRepository.watchByTrip).mockImplementation((_id, _activityId, cb) => {
    cb([]);
    return () => undefined;
  });
  vi.mocked(weatherRepository.watchForecast).mockImplementation((_id, cb) => {
    cb(undefined);
    return () => undefined;
  });
  render(<TripWorkspace tripId={trip.id} userId="user-1" initialTab={initialTab} />);
  // Flush the weather/forecast async effects that set state after render.
  await act(async () => {
    await Promise.resolve();
  });
}

describe("TripWorkspace · AI Scout integration", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it("mounts the embedded scout sidebar when the itinerary Scout AI button is toggled on", async () => {
    await mountWorkspace("itinerary");
    expect(screen.queryByTestId("ai-scout-sidebar")).toBeNull();

    const button = screen.getByRole("button", { name: /scout ai/i });
    fireEvent.click(button);

    const sidebar = screen.getByTestId("ai-scout-sidebar");
    expect(sidebar).toBeTruthy();
    expect(sidebar.getAttribute("data-embedded")).toBe("true");
    expect(sidebar.getAttribute("data-modal")).toBe("false");
  });

  it("toggles the embedded scout sidebar off again from the itinerary button", async () => {
    await mountWorkspace("itinerary");
    const button = screen.getByRole("button", { name: /scout ai/i });

    fireEvent.click(button);
    expect(screen.getByTestId("ai-scout-sidebar")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /bye scout/i }));
    expect(screen.queryByTestId("ai-scout-sidebar")).toBeNull();
  });

  it("opens the scout as a modal from the overview quick action", async () => {
    await mountWorkspace("overview");
    expect(screen.queryByTestId("ai-scout-sidebar")).toBeNull();

    const button = screen.getByRole("button", { name: /scout ai/i });
    fireEvent.click(button);

    const sidebar = screen.getByTestId("ai-scout-sidebar");
    expect(sidebar.getAttribute("data-modal")).toBe("true");
    expect(sidebar.getAttribute("data-embedded")).toBe("false");
  });
});
