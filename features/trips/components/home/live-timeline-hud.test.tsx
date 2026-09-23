import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LiveTimelineHud, visibleTimelineWindow } from "@/features/trips/components/home/live-timeline-hud";
import type { TimelineItem } from "@/features/trips/lib/home-trips";
import type { Trip } from "@/features/domain/entities";

const update = vi.fn().mockResolvedValue(undefined);
const updateChecklist = vi.fn().mockResolvedValue(undefined);

vi.mock("@/features/activities/data/dexie-activity-repository", () => ({
  activityRepository: {
    update: (...args: unknown[]) => update(...args),
    updateChecklist: (...args: unknown[]) => updateChecklist(...args),
  },
}));

vi.mock("@/lib/db/dexie", () => ({
  getCurrentDatabase: () => ({}),
}));

vi.mock("@/features/weather/data/dexie-weather-repository", () => ({
  weatherRepository: {
    watchForecast: () => () => undefined,
  },
}));

vi.mock("@/features/weather/lib/load-trip-weather-forecast", () => ({
  loadTripWeatherForecast: vi.fn().mockResolvedValue({
    status: "hit",
    forecast: {
      tripId: "trip-1",
      fetchedAt: "2026-09-23T12:00:00.000Z",
      forecast: {
        dates: ["2099-09-23"],
        weatherCode: [0],
        temperature2mMax: [22],
        temperature2mMin: [14],
        precipitationSum: [10],
        precipitationProbabilityMax: [20],
        windSpeed10mMax: [5],
        hourly: {
          times: ["2099-09-23T12:00:00.000Z"],
          temperature2m: [21],
          precipitationProbability: [15],
          weatherCode: [0],
        },
      },
    },
  }),
}));

vi.mock("next/image", () => ({
  default: (props: { alt: string }) => <span role="img" aria-label={props.alt} />,
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

const trip = {
  id: "trip-1",
  name: "Lisbon",
  destination: "Lisbon",
  coverImageUrl: null,
  timeZone: "Europe/Lisbon",
  startDate: "2026-09-20",
  endDate: "2026-09-25",
  status: "active",
} as Trip;

const items: TimelineItem[] = [
  {
    id: "activity-1",
    dayDate: "2099-09-23",
    title: "compras",
    description: "Pick up cash and meet the guide downtown.",
    timeLabel: "10:00",
    location: null,
    category: "sightseeing",
    startTime: "2099-09-23T10:00:00",
    endTime: "2099-09-23T12:00:00",
    tripId: "trip-1",
    checklist: [
      { id: "item-1", title: "Sacar efectivo", completed: false, archived: false },
      { id: "item-2", title: "Meet guide", completed: true, archived: false },
    ],
  },
];

const emptyChecklistItems: TimelineItem[] = [
  {
    ...items[0],
    id: "activity-empty",
    title: "museo",
    description: "Visit the contemporary art wing first.",
    checklist: [],
  },
];

const mixedItems: TimelineItem[] = [
  {
    id: "activity-past",
    dayDate: "2020-01-01",
    title: "brunch",
    description: null,
    timeLabel: "09:00",
    location: null,
    category: "food",
    startTime: "2020-01-01T09:00:00",
    endTime: "2020-01-01T10:00:00",
    tripId: "trip-1",
    checklist: [],
  },
  ...items,
];

describe("LiveTimelineHud execution UI", () => {
  beforeEach(() => {
    update.mockClear();
    updateChecklist.mockClear();
  });

  it("shows weather on the timeline header and countdown/progress on cards", async () => {
    render(<LiveTimelineHud trip={trip} items={items} active userId="user-1" />);

    const countdown = screen.getByText(/starts in/i);
    expect(countdown.className).toContain("border-viatik-magenta");
    expect(countdown.className).toContain("text-viatik-magenta");
    expect(countdown.querySelector("svg")).toBeTruthy();
    expect(screen.getByLabelText("1 of 2 tasks completed")).toBeTruthy();
    await waitFor(() => expect(screen.getByLabelText(/°C|Weather unavailable/i)).toBeTruthy());
  });

  it("gives past and current cards distinct theme-aware visual hierarchy", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 23, 12, 0, 0));

    try {
      const stateItems: TimelineItem[] = [
        mixedItems[0],
        {
          ...items[0],
          id: "activity-current",
          dayDate: "2026-09-23",
          title: "walking tour",
          startTime: "2026-09-23T08:00:00",
          endTime: "2026-09-23T18:00:00",
        },
      ];

      render(<LiveTimelineHud trip={trip} items={stateItems} active userId="user-1" />);

      const endedBadge = screen.getByText("Ended");
      expect(endedBadge.className).toContain("bg-black/5");
      expect(endedBadge.className).toContain("dark:bg-white/10");
      expect(screen.getByText("brunch").closest("li")?.className).toContain("opacity-50");

      const activeBadge = screen.getByText("Active");
      expect(activeBadge.className).toContain("bg-viatik-magenta");
      expect(activeBadge.className).toContain("text-white");
      expect(screen.getByText("walking tour").className).toContain("font-bold");
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows completed stops when the day has no live/upcoming activity", () => {
    const pastOnly: TimelineItem[] = [
      {
        id: "activity-past-1",
        dayDate: "2020-01-01",
        title: "compras",
        description: null,
        timeLabel: "12:00",
        location: null,
        category: "shopping",
        startTime: "2020-01-01T12:00:00",
        endTime: "2020-01-01T13:00:00",
        tripId: "trip-1",
        checklist: [],
      },
      {
        id: "activity-past-2",
        dayDate: "2020-01-01",
        title: "comida",
        description: null,
        timeLabel: "15:15",
        location: null,
        category: "food-and-drink",
        startTime: "2020-01-01T15:15:00",
        endTime: "2020-01-01T16:00:00",
        tripId: "trip-1",
        checklist: [],
      },
    ];
    render(<LiveTimelineHud trip={trip} items={pastOnly} active userId="user-1" />);
    expect(screen.getByText("compras")).toBeTruthy();
    expect(screen.getByText("comida")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /show more/i })).toBeNull();
  });

  it("caps the timeline at three items and expands with Show more", () => {
    const fourStops: TimelineItem[] = [
      {
        id: "a1",
        dayDate: "2099-09-23",
        title: "compras",
        description: null,
        timeLabel: "12:00",
        location: null,
        category: "shopping",
        startTime: "2099-09-23T12:00:00",
        endTime: "2099-09-23T13:00:00",
        tripId: "trip-1",
        checklist: [],
      },
      {
        id: "a2",
        dayDate: "2099-09-23",
        title: "comida",
        description: null,
        timeLabel: "15:15",
        location: null,
        category: "food-and-drink",
        startTime: "2099-09-23T15:15:00",
        endTime: "2099-09-23T16:00:00",
        tripId: "trip-1",
        checklist: [],
      },
      {
        id: "a3",
        dayDate: "2099-09-23",
        title: "museo",
        description: null,
        timeLabel: "17:00",
        location: null,
        category: "sightseeing",
        startTime: "2099-09-23T17:00:00",
        endTime: "2099-09-23T18:00:00",
        tripId: "trip-1",
        checklist: [],
      },
      {
        id: "a4",
        dayDate: "2099-09-23",
        title: "bailar",
        description: null,
        timeLabel: "21:00",
        location: null,
        category: "nightlife",
        startTime: "2099-09-23T21:00:00",
        endTime: null,
        tripId: "trip-1",
        checklist: [],
      },
    ];
    render(<LiveTimelineHud trip={trip} items={fourStops} active userId="user-1" />);
    expect(screen.getByText("compras")).toBeTruthy();
    expect(screen.getByText("comida")).toBeTruthy();
    expect(screen.getByText("museo")).toBeTruthy();
    expect(screen.queryByText("bailar")).toBeNull();
    const toggle = screen.getByRole("button", { name: /show more/i });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.className).toContain("w-fit");
    expect(toggle.className).toContain("hover:bg-transparent");
    fireEvent.click(toggle);
    expect(screen.getByText("bailar")).toBeTruthy();
    expect(screen.getByRole("button", { name: /show less/i }).getAttribute("aria-expanded")).toBe("true");
  });

  it("visibleTimelineWindow prefers live stops inside a three-item cap", () => {
    const windowed = visibleTimelineWindow(
      [
        { id: "1", state: "past" as const },
        { id: "2", state: "past" as const },
        { id: "3", state: "future" as const },
        { id: "4", state: "future" as const },
      ],
      false,
      3,
    );
    expect(windowed.map((item) => item.id)).toEqual(["2", "3", "4"]);
  });

  it("keeps weather on the timeline header and out of the detail dialog", async () => {
    render(<LiveTimelineHud trip={trip} items={mixedItems} active userId="user-1" />);

    await waitFor(() => expect(screen.getByLabelText(/°C|Weather unavailable/i)).toBeTruthy());
    expect(screen.getByText("compras")).toBeTruthy();

    fireEvent.click(screen.getByText("compras"));
    expect(screen.getByRole("heading", { name: "compras" })).toBeTruthy();
    expect(screen.getAllByLabelText(/°C|Weather unavailable/i)).toHaveLength(1);
  });

  it("shows description only when there are no sub-tasks", () => {
    render(<LiveTimelineHud trip={trip} items={emptyChecklistItems} active userId="user-1" />);

    fireEvent.click(screen.getByText("museo"));
    expect(screen.getByText("Visit the contemporary art wing first.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /add sub-tasks/i })).toBeNull();
    expect(screen.queryByText(/no sub-tasks/i)).toBeNull();
    expect(screen.queryByText(/sub-tasks/i)).toBeNull();
    expect(screen.queryByLabelText(/tasks completed/i)).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /archive/i })).toBeNull();
  });

  it("shows card progress and interactive checklist after sub-tasks exist", () => {
    const withThree: TimelineItem[] = [
      {
        ...items[0],
        checklist: [
          { id: "a", title: "One", completed: false, archived: false },
          { id: "b", title: "Two", completed: false, archived: false },
          { id: "c", title: "Three", completed: false, archived: false },
        ],
      },
    ];
    render(<LiveTimelineHud trip={trip} items={withThree} active userId="user-1" />);

    expect(screen.getByLabelText("0 of 3 tasks completed")).toBeTruthy();
    expect(screen.getByText("0/3 tasks completed")).toBeTruthy();

    fireEvent.click(screen.getByText("compras"));
    expect(screen.getByRole("checkbox", { name: "One" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Archive One" })).toBeTruthy();
  });

  it("completes and archives checklist items from the detail sheet with feed-aware updates", async () => {
    render(<LiveTimelineHud trip={trip} items={items} active userId="user-1" />);

    fireEvent.click(screen.getByText("compras"));

    fireEvent.click(screen.getByRole("checkbox", { name: "Sacar efectivo" }));
    await waitFor(() =>
      expect(updateChecklist).toHaveBeenCalledWith(
        "activity-1",
        [
          { id: "item-1", title: "Sacar efectivo", completed: true, archived: false },
          { id: "item-2", title: "Meet guide", completed: true, archived: false },
        ],
        { action: "completed_checklist_item", itemTitle: "Sacar efectivo" },
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Archive Sacar efectivo" }));
    await waitFor(() =>
      expect(updateChecklist).toHaveBeenCalledWith(
        "activity-1",
        [
          { id: "item-1", title: "Sacar efectivo", completed: false, archived: true },
          { id: "item-2", title: "Meet guide", completed: true, archived: false },
        ],
        { action: "skipped_checklist_item", itemTitle: "Sacar efectivo" },
      ),
    );
  });
});
