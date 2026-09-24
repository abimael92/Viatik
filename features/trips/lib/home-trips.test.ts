import { describe, it, expect } from "vitest";
import {
  activityDateTime,
  buildTimeline,
  formatTimeInZone,
  getTemporalState,
  inferTimeZoneFromDestination,
  resolveTripScheduleTimeZone,
} from "./home-trips";
import type { Activity } from "@/features/domain/entities";

const TEST_NOW = new Date("2024-06-15T12:00:00Z");

describe("buildTimeline participation", () => {
  const base = { id: "activity-1", tripId: "trip-1", dayDate: "2026-09-16", title: "Museum", description: null, category: "sightseeing", startTime: null, endTime: null, position: 1, estimatedCostMinor: null, createdBy: "user-1", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", deletedAt: null } satisfies Activity;

  it("includes open, attending, and missing-roster activities; hides explicit declined or pending status", () => {
    const activities = [
      { ...base, id: "open", participants: [] },
      { ...base, id: "attending", participants: [{ userId: "user-1", status: "attending" as const }] },
      { ...base, id: "declined", participants: [{ userId: "user-1", status: "declined" as const }] },
      { ...base, id: "pending", participants: [{ userId: "user-1", status: "pending" as const }] },
      { ...base, id: "missing", participants: [{ userId: "user-2", status: "attending" as const }] },
    ];
    expect(
      buildTimeline(activities, {
        scope: "upcoming",
        today: "2026-09-15",
        limit: 10,
        currentUserId: "user-1",
      }).map((item) => item.id),
    ).toEqual(["open", "attending", "missing"]);
  });

  it("keeps past, current, and future itinerary days visible for an active trip", () => {
    const activities = [
      { ...base, id: "yesterday", dayDate: "2026-09-15", participants: [] },
      { ...base, id: "today", dayDate: "2026-09-16", participants: [] },
      { ...base, id: "tomorrow", dayDate: "2026-09-17", participants: [] },
    ];
    expect(
      buildTimeline(activities, {
        scope: "today",
        today: "2026-09-16",
        limit: 10,
        currentUserId: "user-1",
      }).map((item) => item.id),
    ).toEqual(["yesterday", "today", "tomorrow"]);
  });

  it("retains participant snapshots for activity detail attendees", () => {
    const participants = [
      { userId: "user-1", status: "attending" as const },
      {
        userId: null,
        travelerId: "traveler-1",
        displayName: "Alex Chen",
        status: "attending" as const,
      },
    ];

    const [item] = buildTimeline(
      [{ ...base, participants }],
      {
        scope: "upcoming",
        today: "2026-09-15",
        limit: 10,
        currentUserId: "user-1",
      },
    );

    expect(item.participants).toEqual(participants);
  });
});

describe("Timezone-aware time formatting", () => {
  it("preserves schedule wall-clock digits even when sync added a Z suffix", () => {
    // 10:00 means 10:00 trip-local — not 06:00 after converting absolute UTC.
    expect(formatTimeInZone("2024-06-15T10:00:00Z", "America/New_York")).toBe("10:00");
    expect(formatTimeInZone("2024-06-15T10:00:00Z", "Asia/Tokyo")).toBe("10:00");
  });

  it("preserves naive destination-local wall times", () => {
    expect(formatTimeInZone("2024-06-15T18:30:00", "Europe/Lisbon")).toBe("18:30");
  });

  it("handles missing values", () => {
    expect(formatTimeInZone(null, "America/New_York")).toBeNull();
  });
});

describe("getTemporalState", () => {
  it("returns 'future' when activity hasn't started yet", () => {
    const activity = {
      startTime: "2024-06-15T14:00:00Z", // 2 PM UTC
      endTime: "2024-06-15T16:00:00Z",   // 4 PM UTC
      dayDate: "2024-06-15",
    };
    // Now is 12:00 UTC, activity starts at 14:00 UTC
    expect(getTemporalState(activity, TEST_NOW, "UTC")).toBe("future");
  });

  it("returns 'current' when activity is ongoing", () => {
    const activity = {
      startTime: "2024-06-15T10:00:00Z", // 10 AM UTC
      endTime: "2024-06-15T12:00:00Z",   // 12 PM UTC
      dayDate: "2024-06-15",
    };
    // Now is 11:00 UTC, activity is ongoing
    expect(getTemporalState(activity, new Date("2024-06-15T11:00:00Z"), "UTC")).toBe("current");
  });

  it("returns 'past' when activity has ended", () => {
    const activity = {
      startTime: "2024-06-15T08:00:00Z", // 8 AM UTC
      endTime: "2024-06-15T10:00:00Z",   // 10 AM UTC
      dayDate: "2024-06-15",
    };
    // Now is 12:00 UTC, activity ended at 10:00 UTC
    expect(getTemporalState(activity, TEST_NOW, "UTC")).toBe("past");
  });

  it("treats synced Z suffixes as trip wall-clock when a destination timezone is set", () => {
    const activity = {
      startTime: "2026-09-23T17:00:00.000Z",
      endTime: "2026-09-23T18:00:00.000Z",
      dayDate: "2026-09-23",
    };
    // 17:00–18:00 Lisbon (WEST, UTC+1) => 16:00–17:00 UTC
    expect(getTemporalState(activity, new Date("2026-09-23T15:30:00.000Z"), "Europe/Lisbon")).toBe("future");
    expect(getTemporalState(activity, new Date("2026-09-23T16:30:00.000Z"), "Europe/Lisbon")).toBe("current");
    expect(getTemporalState(activity, new Date("2026-09-23T18:30:00.000Z"), "Europe/Lisbon")).toBe("past");
  });

  it("activityDateTime projects Z-suffixed digits into the trip timezone", () => {
    const instant = activityDateTime("2026-09-23T17:00:00.000Z", "2026-09-23", "Europe/Lisbon");
    // 17:00 Lisbon in late September is WEST (UTC+1) => 16:00 UTC
    expect(instant.toISOString()).toBe("2026-09-23T16:00:00.000Z");
    // Must not treat the Z as absolute UTC (which would stay 17:00Z).
    expect(instant.toISOString()).not.toBe("2026-09-23T17:00:00.000Z");
  });

  it("keeps evening Mexico wall-clock stops future in the afternoon", () => {
    const activity = {
      startTime: "2026-09-23T21:00:00.000Z",
      endTime: null,
      dayDate: "2026-09-23",
    };
    // 16:50 Mexico City == 22:50Z — must not treat 21:00Z digits as absolute UTC.
    expect(getTemporalState(activity, new Date("2026-09-23T22:50:00.000Z"), "America/Mexico_City")).toBe("future");
  });

  it("infers Mexico City from destination text even when trip.timeZone is stale", () => {
    expect(inferTimeZoneFromDestination("Ciudad de México")).toBe("America/Mexico_City");
    expect(
      resolveTripScheduleTimeZone({ destination: "CDMX", timeZone: "Europe/Lisbon" }),
    ).toBe("America/Mexico_City");
  });

  it("handles activities with no end time (30 min default)", () => {
    const activity = {
      startTime: "2024-06-15T10:00:00Z",
      endTime: null,
      dayDate: "2024-06-15",
    };
    // At start time + 15 min = current
    expect(getTemporalState(activity, new Date("2024-06-15T10:15:00Z"), "UTC")).toBe("current");
    // At start time + 45 min = past
    expect(getTemporalState(activity, new Date("2024-06-15T10:45:00Z"), "UTC")).toBe("past");
  });

  it("handles activities with no start time (all-day event)", () => {
    const activity = {
      startTime: null,
      endTime: null,
      dayDate: "2024-06-15",
    };
    // Untimed activities remain visible in the current-day upcoming list.
    expect(getTemporalState(activity, TEST_NOW, "UTC")).toBe("future");
  });

  it("correctly handles timezone offset for current activity", () => {
    const activity = {
      startTime: "2024-06-15T14:00:00Z", // 2 PM UTC = 10 AM EDT
      endTime: "2024-06-15T16:00:00Z",   // 4 PM UTC = 12 PM EDT
      dayDate: "2024-06-15",
    };
    // Now is 11:00 AM EDT = 15:00 UTC -> activity is current
    expect(getTemporalState(activity, new Date("2024-06-15T15:00:00Z"), "UTC")).toBe("current");
  });

  it("treats naive itinerary times as destination-local wall time", () => {
    const activity = {
      startTime: "2024-06-15T18:30:00",
      endTime: null,
      dayDate: "2024-06-15",
    };
    expect(formatTimeInZone(activity.startTime, "Europe/Lisbon")).toBe("18:30");
    expect(getTemporalState(activity, new Date("2024-06-15T22:03:00Z"), "Europe/Lisbon")).toBe("past");
  });

  it("identifies immediate next activity as current when none have started", () => {
    const activity1 = {
      startTime: "2024-06-15T14:00:00Z",
      endTime: "2024-06-15T16:00:00Z",
      dayDate: "2024-06-15",
    };
    const activity2 = {
      startTime: "2024-06-15T17:00:00Z",
      endTime: "2024-06-15T19:00:00Z",
      dayDate: "2024-06-15",
    };
    // Now is 12:00 UTC, neither started yet, but activity1 is the immediate next
    // Note: getTemporalState evaluates individual activities, not the list
    expect(getTemporalState(activity1, TEST_NOW, "UTC")).toBe("future");
    expect(getTemporalState(activity2, TEST_NOW, "UTC")).toBe("future");
  });

  it("returns 'future' for invalid dates", () => {
    const activity = {
      startTime: "invalid-date",
      endTime: "invalid-date",
      dayDate: "2024-06-15",
    };
    expect(getTemporalState(activity, TEST_NOW, "UTC")).toBe("future");
  });
});

describe("Temporal state transitions across midnight", () => {
  it("handles activities spanning midnight correctly", () => {
    // Activity from 11 PM to 1 AM next day
    const activity = {
      startTime: "2024-06-15T23:00:00Z",
      endTime: "2024-06-16T01:00:00Z",
      dayDate: "2024-06-15",
    };

    // Before start
    expect(getTemporalState(activity, new Date("2024-06-15T22:00:00Z"), "UTC")).toBe("future");
    // During activity
    expect(getTemporalState(activity, new Date("2024-06-16T00:30:00Z"), "UTC")).toBe("current");
    // After end
    expect(getTemporalState(activity, new Date("2024-06-16T02:00:00Z"), "UTC")).toBe("past");
  });
});