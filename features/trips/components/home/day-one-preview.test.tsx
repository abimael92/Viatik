import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Trip } from "@/features/domain/entities";
import { DayOnePreview } from "@/features/trips/components/home/day-one-preview";
import type { TimelineItem } from "@/features/trips/lib/home-trips";

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "trip-1",
    ownerId: "owner-1",
    name: "Lisbon with friends",
    description: null,
    destination: "Lisbon, Portugal",
    latitude: null,
    longitude: null,
    placeId: null,
    timeZone: null,
    startDate: "2026-12-01",
    endDate: "2026-12-07",
    status: "planned",
    startedAt: null,
    completedAt: null,
    coverImageUrl: null,
    adultCount: 2,
    childCount: 0,
    baseCurrency: "EUR",
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
    ...overrides,
  };
}

function makeItem(id: string, overrides: Partial<TimelineItem> = {}): TimelineItem {
  return {
    id,
    dayDate: "2026-12-01",
    title: `Stop ${id}`,
    description: null,
    timeLabel: null,
    location: null,
    category: "sightseeing",
    checklist: [],
    ...overrides,
  };
}

afterEach(cleanup);

describe("DayOnePreview", () => {
  it("shows up to three day-1 items in order and links to the itinerary", () => {
    const items = [
      makeItem("a"),
      makeItem("b"),
      makeItem("c"),
      makeItem("d"),
      makeItem("other-day", { dayDate: "2026-12-02" }),
    ];
    render(<DayOnePreview trip={makeTrip()} items={items} />);

    expect(screen.getByRole("heading", { name: "Day 1 preview" })).toBeTruthy();
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Stop a"),
      expect.stringContaining("Stop b"),
      expect.stringContaining("Stop c"),
    ]);
    expect(screen.getByRole("link", { name: "View full itinerary" }).getAttribute("href")).toBe(
      "/trips/trip-1?tab=itinerary"
    );
  });

  it("renders the time label or the all-day fallback with location", () => {
    render(
      <DayOnePreview
        trip={makeTrip()}
        items={[
          makeItem("timed", { timeLabel: "09:30", location: "Alfama" }),
          makeItem("untimed"),
        ]}
      />
    );
    expect(screen.getByText("09:30")).toBeTruthy();
    expect(screen.getByText("Alfama")).toBeTruthy();
    expect(screen.getByText("all day")).toBeTruthy();
  });

  it("shows the empty state linking to add-activity when day 1 has no items", () => {
    render(<DayOnePreview trip={makeTrip()} items={[makeItem("later", { dayDate: "2026-12-03" })]} />);
    expect(screen.getByText("Nothing planned for day 1 yet.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Plan your first day" }).getAttribute("href")).toBe(
      "/trips/trip-1?tab=itinerary&action=add-activity"
    );
  });

  it("renders nothing when the trip has no start date", () => {
    const { container } = render(<DayOnePreview trip={makeTrip({ startDate: null })} items={[makeItem("a")]} />);
    expect(container.firstChild).toBeNull();
  });
});
