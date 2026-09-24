import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LiveTimelineHud, visibleTimelineWindow } from "@/features/trips/components/home/live-timeline-hud";
import type { TimelineItem } from "@/features/trips/lib/home-trips";
import type { Trip } from "@/features/domain/entities";

const update = vi.fn().mockResolvedValue(undefined);
const updateChecklist = vi.fn().mockResolvedValue(undefined);
const notify = vi.fn();

vi.mock("@/features/activities/data/dexie-activity-repository", () => ({
  activityRepository: {
    update: (...args: unknown[]) => update(...args),
    updateChecklist: (...args: unknown[]) => updateChecklist(...args),
  },
}));

vi.mock("@/lib/db/dexie", () => ({
  getCurrentDatabase: () => ({}),
}));

vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: notify }),
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
  default: ({ children, href, ...props }: React.ComponentProps<"a">) => <a href={href} {...props}>{children}</a>,
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
    participants: [
      { userId: "user-1", status: "attending" },
      { userId: null, travelerId: "traveler-1", displayName: "Alex Chen", status: "attending" },
    ],
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
    participants: [],
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
    notify.mockClear();
  });

  it("shows weather on the timeline header and countdown/progress on cards", async () => {
    render(<LiveTimelineHud trip={trip} items={items} active userId="user-1" />);

    const countdown = screen.getByText(/starts in/i);
    expect(countdown.className).toContain("bg-viatik-magenta/10");
    expect(countdown.className).toContain("dark:bg-viatik-magenta/20");
    expect(countdown.className).toContain("text-viatik-magenta");
    expect(countdown.querySelector("svg")).toBeTruthy();
    const futureCard = screen.getByText("compras").closest('[role="button"]');
    expect(futureCard?.className).toContain("bg-viatik-magenta/5");
    expect(futureCard?.className).toContain("dark:bg-viatik-magenta/10");
    expect(screen.getByLabelText("1 of 2 Must-dos complete")).toBeTruthy();
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
    const timeline = document.getElementById(toggle.getAttribute("aria-controls")!);
    expect(timeline!.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(timeline!.className).toContain("max-h-[28rem]");
    fireEvent.click(toggle);
    expect(screen.getByText("bailar")).toBeTruthy();
    expect(timeline!.className).not.toContain("max-h-[28rem]");
    expect(timeline!.className).not.toContain("overflow-y-auto");
    expect(screen.getByRole("button", { name: /show less/i }).getAttribute("aria-expanded")).toBe("true");
  });

  it("places Show more above the timeline when older activities are hidden", () => {
    const pastStops: TimelineItem[] = [1, 2, 3, 4].map((index) => ({
      id: `past-${index}`,
      dayDate: "2020-01-01",
      title: `past stop ${index}`,
      description: null,
      timeLabel: `${index + 8}:00`,
      location: null,
      category: "sightseeing",
      startTime: `2020-01-01T${String(index + 8).padStart(2, "0")}:00:00`,
      endTime: `2020-01-01T${String(index + 9).padStart(2, "0")}:00:00`,
      tripId: "trip-1",
      checklist: [],
    }));

    render(<LiveTimelineHud trip={trip} items={pastStops} active userId="user-1" />);

    const toggle = screen.getByRole("button", { name: /show more/i });
    const timeline = document.getElementById(toggle.getAttribute("aria-controls")!);
    expect(toggle.compareDocumentPosition(timeline!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("uses minimal text styling for timeline navigation actions", () => {
    const fourStops = Array.from({ length: 4 }, (_, index) => ({
      ...items[0],
      id: `future-${index}`,
      title: `future ${index}`,
      startTime: `2099-09-23T${String(index + 10).padStart(2, "0")}:00:00`,
    }));
    render(<LiveTimelineHud trip={trip} items={fourStops} active userId="user-1" />);

    expect(screen.getByRole("button", { name: /show more/i }).className).toContain("text-xs");
    const itineraryLink = screen.getByRole("link", { name: /go to itinerary/i });
    expect(itineraryLink.className).toContain("hover:bg-transparent");
    expect(itineraryLink.className).toContain("text-muted-foreground");
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

  it("shows description and attendees without Must-do UI when there are no Must-dos", () => {
    render(<LiveTimelineHud trip={trip} items={emptyChecklistItems} active userId="user-1" />);

    fireEvent.click(screen.getByText("museo"));
    expect(screen.getByText("Visit the contemporary art wing first.")).toBeTruthy();
    expect(screen.getByText("Description")).toBeTruthy();
    expect(screen.getByText("Attendees")).toBeTruthy();
    expect(screen.getByText("Everyone on the trip")).toBeTruthy();
    expect(screen.queryByText("Must-dos")).toBeNull();
    expect(screen.queryByLabelText(/Must-dos complete/i)).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /archive/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
  });

  it("represents a missing description with a neutral fallback", () => {
    render(
      <LiveTimelineHud
        trip={trip}
        items={[{ ...emptyChecklistItems[0], description: null }]}
        active
        userId="user-1"
      />,
    );

    fireEvent.click(screen.getByText("museo"));
    expect(screen.getByText("No description provided.")).toBeTruthy();
    expect(screen.getByText("Everyone on the trip")).toBeTruthy();
  });

  it("shows description, attendees, and interactive Must-dos when populated", () => {
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

    expect(screen.getByLabelText("0 of 3 Must-dos complete")).toBeTruthy();
    expect(screen.getByText("0/3 Must-dos complete")).toBeTruthy();

    fireEvent.click(screen.getByText("compras"));
    expect(screen.getByText("Pick up cash and meet the guide downtown.")).toBeTruthy();
    expect(screen.getByText("You")).toBeTruthy();
    expect(screen.getByText("Alex Chen")).toBeTruthy();
    expect(screen.getByText("Must-dos")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "One" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Archive One" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete One" })).toBeTruthy();
  });

  it("optimistically updates the checkbox, count, and progress before Dexie resolves", async () => {
    let resolveWrite!: () => void;
    updateChecklist.mockReturnValueOnce(new Promise<void>((resolve) => {
      resolveWrite = resolve;
    }));
    render(<LiveTimelineHud trip={trip} items={items} active userId="user-1" />);

    fireEvent.click(screen.getByText("compras"));
    const checkbox = screen.getByRole("checkbox", { name: "Sacar efectivo" }) as HTMLInputElement;
    fireEvent.click(checkbox);

    expect(checkbox.checked).toBe(true);
    expect(screen.getAllByText("2/2 Must-dos complete").length).toBeGreaterThan(0);
    const progress = screen.getAllByLabelText("2 of 2 Must-dos complete");
    expect(progress.length).toBeGreaterThan(0);
    expect(progress.some((element) => element.querySelector('[style*="width: 100%"]'))).toBe(true);

    resolveWrite();
    await waitFor(() => expect(updateChecklist).toHaveBeenCalledOnce());
  });

  it("rolls back optimistic progress and reports a failed local write", async () => {
    updateChecklist.mockRejectedValueOnce(new Error("Dexie write failed"));
    render(<LiveTimelineHud trip={trip} items={items} active userId="user-1" />);

    fireEvent.click(screen.getByText("compras"));
    fireEvent.click(screen.getByRole("checkbox", { name: "Sacar efectivo" }));

    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith(expect.objectContaining({
        title: "Must-dos not saved",
        variant: "error",
      })),
    );
    expect((screen.getByRole("checkbox", { name: "Sacar efectivo" }) as HTMLInputElement).checked).toBe(false);
    expect(screen.getAllByText("1/2 Must-dos complete").length).toBeGreaterThan(0);
  });

  it("completes and archives checklist items with feed-aware local updates", async () => {
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

  it("hard-deletes a Must-do through the feed-aware local update path", async () => {
    render(<LiveTimelineHud trip={trip} items={items} active userId="user-1" />);

    fireEvent.click(screen.getByText("compras"));
    fireEvent.click(screen.getByRole("button", { name: "Delete Sacar efectivo" }));

    await waitFor(() =>
      expect(updateChecklist).toHaveBeenCalledWith(
        "activity-1",
        [{ id: "item-2", title: "Meet guide", completed: true, archived: false }],
        { action: "deleted_checklist_item", itemTitle: "Sacar efectivo" },
      ),
    );
  });
});
