import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActivityCard } from "@/features/activities/components/activity-card";

if (typeof window !== "undefined") {
  window.matchMedia ??= () => ({ matches: false, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as unknown as MediaQueryList;
}

const mockActivity = {
  id: "act-1",
  tripId: "trip-1",
  dayDate: "2026-06-01",
  title: "Museum visit",
  description: null,
  location: "Paris",
  category: "sightseeing",
  startTime: "2026-06-01T10:00:00",
  endTime: null,
  position: 1,
  createdBy: "user-1",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  deletedAt: null,
};

vi.mock("@dnd-kit/sortable", () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: {
    Translate: {
      toString: () => "",
    },
  },
}));

describe("ActivityCard", () => {
  afterEach(() => cleanup());

  it("renders as a listitem with distinct move and open-details buttons", () => {
    render(<ActivityCard activity={mockActivity} onSelect={() => {}} />);

    expect(screen.getByRole("listitem")).toBeTruthy();
    expect(screen.getByRole("button", { name: `Move ${mockActivity.title}` })).toBeTruthy();
    expect(screen.getByRole("button", { name: `Open details for ${mockActivity.title}` })).toBeTruthy();
  });

  it("opens details from the title button, not the card container", () => {
    const onSelect = vi.fn();
    const { container } = render(<ActivityCard activity={mockActivity} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: `Open details for ${mockActivity.title}` }));
    expect(onSelect).toHaveBeenCalledWith(mockActivity);

    fireEvent.click(container.firstChild as Element);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("hides the move handle when not draggable", () => {
    render(<ActivityCard activity={mockActivity} onSelect={() => {}} draggable={false} />);

    expect(screen.queryByRole("button", { name: /Move/ })).toBeNull();
    expect(screen.getByRole("button", { name: `Open details for ${mockActivity.title}` })).toBeTruthy();
  });
});
