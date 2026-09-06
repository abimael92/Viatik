import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { GuestTripView } from "@/features/sharing/components/guest-trip-view";
import type { SharedTripSnapshot } from "@/features/sharing/domain/share-types";

if (typeof window !== "undefined") {
  window.matchMedia ??= () => ({ matches: false, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as unknown as MediaQueryList;
}

function snapshot(overrides: Partial<SharedTripSnapshot> = {}): SharedTripSnapshot {
  return {
    share: {
      id: "link-1",
      tripId: "trip-1",
      slug: "Abc123Def456",
      label: null,
      createdBy: "owner-1",
      allowItinerary: true,
      allowMap: true,
      allowGallery: true,
      active: true,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      deletedAt: null,
    },
    name: "Paris Week",
    destination: "Paris",
    startDate: "2026-06-01",
    endDate: "2026-06-08",
    coverImageUrl: null,
    activities: [
      {
        id: "act-1",
        dayDate: "2026-06-02",
        title: "Louvre",
        description: "Morning visit",
        location: "Louvre Museum",
        latitude: 48.8606,
        longitude: 2.3376,
        category: "sightseeing",
        startTime: "2026-06-02T09:00:00Z",
      },
    ],
    media: [{ id: "media-1", caption: "The gallery", takenAt: "2026-06-02", url: "https://img/1.jpg" }],
    ...overrides,
  };
}

describe("GuestTripView", () => {
  afterEach(() => cleanup());

  it("renders the trip header and all enabled tabs", () => {
    render(<GuestTripView snapshot={snapshot()} />);

    expect(screen.getByText("Paris Week")).toBeTruthy();
    expect(screen.getByText("Itinerary")).toBeTruthy();
    expect(screen.getByText("Map")).toBeTruthy();
    expect(screen.getByText("Photos")).toBeTruthy();
    // Itinerary is the default tab.
    expect(screen.getByText("Louvre")).toBeTruthy();
  });

  it("hides sections the owner disabled", () => {
    render(
      <GuestTripView
        snapshot={snapshot({
          share: {
            ...snapshot().share,
            allowMap: false,
            allowGallery: false,
          },
        })}
      />,
    );

    expect(screen.queryByText("Map")).toBeNull();
    expect(screen.queryByText("Photos")).toBeNull();
    expect(screen.getByText("Louvre")).toBeTruthy();
  });

  it("shows the gallery when the Photos tab is selected", () => {
    render(<GuestTripView snapshot={snapshot()} />);
    fireEvent.click(screen.getByText("Photos"));
    expect(screen.getByRole("img", { name: "The gallery" })).toBeTruthy();
  });

  it("shows the map locations tab", () => {
    render(<GuestTripView snapshot={snapshot()} />);
    fireEvent.click(screen.getByText("Map"));
    expect(screen.getByRole("link", { name: "Open map" })).toBeTruthy();
    expect(screen.getByText("Louvre Museum")).toBeTruthy();
  });
});
