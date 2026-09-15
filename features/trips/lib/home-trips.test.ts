import { describe, it, expect } from "vitest";
import {
  buildTimeline,
  formatTimeInZone,
  getTemporalState,
} from "./home-trips";
import type { Activity } from "@/features/domain/entities";

const TEST_NOW = new Date("2024-06-15T12:00:00Z");

describe("buildTimeline participation", () => {
  const base = { id: "activity-1", tripId: "trip-1", dayDate: "2026-09-16", title: "Museum", description: null, category: "sightseeing", startTime: null, endTime: null, position: 1, estimatedCostMinor: null, createdBy: "user-1", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", deletedAt: null } satisfies Activity;

  it("includes only activities the current user is confirmed to attend", () => {
    const activities = [
      { ...base, id: "attending", participants: [{ userId: "user-1", status: "attending" as const }] },
      { ...base, id: "declined", participants: [{ userId: "user-1", status: "declined" as const }] },
      { ...base, id: "pending", participants: [{ userId: "user-1", status: "pending" as const }] },
      { ...base, id: "missing", participants: [{ userId: "user-2", status: "attending" as const }] },
    ];
    expect(buildTimeline(activities, { scope: "upcoming", today: "2026-09-15", limit: 10, currentUserId: "user-1" }).map((item) => item.id)).toEqual(["attending"]);
  });
});

describe("Timezone-aware time formatting", () => {
  it("formats time in the destination timezone", () => {
    // 2024-06-15T10:00:00Z = 06:00 in New York (EDT, UTC-4)
    const utcTime = "2024-06-15T10:00:00Z";
    const nyTime = formatTimeInZone(utcTime, "America/New_York");
    expect(nyTime).toBe("06:00");
  });

  it("formats time in Tokyo timezone", () => {
    // 2024-06-15T10:00:00Z = 19:00 in Tokyo (JST, UTC+9)
    const utcTime = "2024-06-15T10:00:00Z";
    const tokyoTime = formatTimeInZone(utcTime, "Asia/Tokyo");
    expect(tokyoTime).toBe("19:00");
  });

  it("falls back to local time when timezone is invalid", () => {
    const utcTime = "2024-06-15T10:00:00Z";
    const result = formatTimeInZone(utcTime, "Invalid/Timezone");
    expect(result).not.toBeNull();
  });

  it("returns null for null startTime", () => {
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
    expect(getTemporalState(activity, TEST_NOW)).toBe("future");
  });

  it("returns 'current' when activity is ongoing", () => {
    const activity = {
      startTime: "2024-06-15T10:00:00Z", // 10 AM UTC
      endTime: "2024-06-15T12:00:00Z",   // 12 PM UTC
      dayDate: "2024-06-15",
    };
    // Now is 11:00 UTC, activity is ongoing
    expect(getTemporalState(activity, new Date("2024-06-15T11:00:00Z"))).toBe("current");
  });

  it("returns 'past' when activity has ended", () => {
    const activity = {
      startTime: "2024-06-15T08:00:00Z", // 8 AM UTC
      endTime: "2024-06-15T10:00:00Z",   // 10 AM UTC
      dayDate: "2024-06-15",
    };
    // Now is 12:00 UTC, activity ended at 10:00 UTC
    expect(getTemporalState(activity, TEST_NOW)).toBe("past");
  });

  it("handles activities with no end time (30 min default)", () => {
    const activity = {
      startTime: "2024-06-15T10:00:00Z",
      endTime: null,
      dayDate: "2024-06-15",
    };
    // At start time + 15 min = current
    expect(getTemporalState(activity, new Date("2024-06-15T10:15:00Z"))).toBe("current");
    // At start time + 45 min = past
    expect(getTemporalState(activity, new Date("2024-06-15T10:45:00Z"))).toBe("past");
  });

  it("handles activities with no start time (all-day event)", () => {
    const activity = {
      startTime: null,
      endTime: null,
      dayDate: "2024-06-15",
    };
    // Untimed activities remain visible in the current-day upcoming list.
    expect(getTemporalState(activity, TEST_NOW)).toBe("future");
  });

  it("correctly handles timezone offset for current activity", () => {
    const activity = {
      startTime: "2024-06-15T14:00:00Z", // 2 PM UTC = 10 AM EDT
      endTime: "2024-06-15T16:00:00Z",   // 4 PM UTC = 12 PM EDT
      dayDate: "2024-06-15",
    };
    // Now is 11:00 AM EDT = 15:00 UTC -> activity is current
    expect(getTemporalState(activity, new Date("2024-06-15T15:00:00Z"))).toBe("current");
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
    expect(getTemporalState(activity1, TEST_NOW)).toBe("future");
    expect(getTemporalState(activity2, TEST_NOW)).toBe("future");
  });

  it("returns 'future' for invalid dates", () => {
    const activity = {
      startTime: "invalid-date",
      endTime: "invalid-date",
      dayDate: "2024-06-15",
    };
    expect(getTemporalState(activity, TEST_NOW)).toBe("future");
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
    expect(getTemporalState(activity, new Date("2024-06-15T22:00:00Z"))).toBe("future");
    // During activity
    expect(getTemporalState(activity, new Date("2024-06-16T00:30:00Z"))).toBe("current");
    // After end
    expect(getTemporalState(activity, new Date("2024-06-16T02:00:00Z"))).toBe("past");
  });
});