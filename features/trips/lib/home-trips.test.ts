import { describe, expect, it } from "vitest";

import type { Activity, Trip } from "@/features/domain/entities";
import { buildTimeline, daysUntil, formatCountdown, pickPrimaryTrips } from "@/features/trips/lib/home-trips";

function makeTrip(overrides: Partial<Trip>): Trip {
  return {
    id: "trip-1",
    ownerId: "owner-1",
    name: "Lisbon",
    description: null,
    destination: "Lisbon, Portugal",
    latitude: null,
    longitude: null,
    placeId: null,
    timeZone: null,
    startDate: null,
    endDate: null,
    status: "planned",
    startedAt: null,
    completedAt: null,
    coverImageUrl: null,
    adultCount: 2,
    childCount: 0,
    baseCurrency: "EUR",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    deletedAt: null,
    ...overrides,
  };
}

const today = new Date(Date.UTC(2026, 8, 4)); // 2026-09-04

describe("daysUntil", () => {
  it("returns 0 for the current day", () => {
    expect(daysUntil("2026-09-04", today)).toBe(0);
  });

  it("returns a positive count for future dates", () => {
    expect(daysUntil("2026-09-07", today)).toBe(3);
  });

  it("returns a negative count for past dates", () => {
    expect(daysUntil("2026-09-01", today)).toBe(-3);
  });
});

describe("formatCountdown", () => {
  it("handles the current day", () => {
    expect(formatCountdown("2026-09-04", today)).toBe("Today");
  });

  it("pluralizes days", () => {
    expect(formatCountdown("2026-09-07", today)).toBe("3 days left");
    expect(formatCountdown("2026-09-05", today)).toBe("1 day left");
  });

  it("handles started trips", () => {
    expect(formatCountdown("2026-09-01", today)).toBe("Started");
  });
});

describe("pickPrimaryTrips", () => {
  it("prefers the active trip and still reports the nearest upcoming", () => {
    const active = makeTrip({ id: "active", startDate: "2026-09-02", endDate: "2026-09-10" });
    const upcoming = makeTrip({ id: "upcoming", startDate: "2026-10-01", endDate: "2026-10-05" });
    const result = pickPrimaryTrips([upcoming, active], today);

    expect(result.primaryTrip?.id).toBe("active");
    expect(result.activeTrip?.id).toBe("active");
    expect(result.nextTrip?.id).toBe("upcoming");
  });

  it("falls back to the nearest upcoming trip when nothing is active", () => {
    const far = makeTrip({ id: "far", startDate: "2026-11-01" });
    const near = makeTrip({ id: "near", startDate: "2026-10-01" });
    const result = pickPrimaryTrips([far, near], today);

    expect(result.primaryTrip?.id).toBe("near");
    expect(result.nextTrip?.id).toBe("near");
    expect(result.activeTrip).toBeNull();
  });

  it("returns nulls when there are no dated trips", () => {
    const undated = makeTrip({ id: "undated" });
    expect(pickPrimaryTrips([undated], today).primaryTrip).toBeNull();
    expect(pickPrimaryTrips([], today).primaryTrip).toBeNull();
  });

  it("excludes completed and cancelled trips entirely", () => {
    const completed = makeTrip({ id: "done", status: "completed", startDate: "2026-08-01", endDate: "2026-08-05" });
    const cancelled = makeTrip({ id: "cancelled", status: "cancelled", startDate: "2026-08-01", endDate: "2026-08-05" });
    const upcoming = makeTrip({ id: "upcoming", startDate: "2026-10-01", endDate: "2026-10-05" });

    const result = pickPrimaryTrips([completed, cancelled, upcoming], today);

    expect(result.primaryTrip?.id).toBe("upcoming");
    expect(result.activeTrip).toBeNull();
    expect(result.nextTrip?.id).toBe("upcoming");
    expect(result.upNext.map((t) => t.id)).toEqual([]);
  });

  it("returns other planned trips in upNext sorted by start date, excluding the hero", () => {
    const hero = makeTrip({ id: "hero", startDate: "2026-10-01", endDate: "2026-10-05" });
    const later = makeTrip({ id: "later", startDate: "2026-12-01" });
    const soon = makeTrip({ id: "soon", startDate: "2026-11-01" });

    const result = pickPrimaryTrips([hero, later, soon], today);

    expect(result.primaryTrip?.id).toBe("hero");
    expect(result.upNext.map((t) => t.id)).toEqual(["soon", "later"]);
  });

  it("populates upNext with planned trips even when a trip is active", () => {
    const active = makeTrip({ id: "active", startDate: "2026-09-02", endDate: "2026-09-10" });
    const later = makeTrip({ id: "later", startDate: "2026-11-01" });

    const result = pickPrimaryTrips([active, later], today);

    expect(result.primaryTrip?.id).toBe("active");
    expect(result.activeTrip?.id).toBe("active");
    expect(result.upNext.map((t) => t.id)).toEqual(["later"]);
  });
});

function makeActivity(overrides: Partial<Activity>): Activity {
  return {
    id: "a",
    tripId: "trip-1",
    dayDate: "2026-10-01",
    title: "Lunch",
    description: null,
    location: null,
    category: "food",
    startTime: null,
    endTime: null,
    position: 0,
    estimatedCostMinor: null,
    createdBy: "owner-1",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    deletedAt: null,
    ...overrides,
  };
}

describe("buildTimeline", () => {
  it("returns only today's items sorted by time in today scope", () => {
    const activities = [
      makeActivity({ id: "later", dayDate: "2026-09-04", startTime: "2026-09-04T13:30:00Z" }),
      makeActivity({ id: "earlier", dayDate: "2026-09-04", startTime: "2026-09-04T10:00:00Z" }),
      makeActivity({ id: "other-day", dayDate: "2026-09-05", startTime: "2026-09-05T10:00:00Z" }),
    ];
    const result = buildTimeline(activities, { scope: "today", today: "2026-09-04", limit: 3 });

    expect(result.map((item) => item.id)).toEqual(["earlier", "later"]);
  });

  it("previews the first N chronological items in upcoming scope", () => {
    const activities = [
      makeActivity({ id: "b", dayDate: "2026-10-02", startTime: "2026-10-02T09:00:00Z" }),
      makeActivity({ id: "a", dayDate: "2026-10-01", startTime: "2026-10-01T09:00:00Z" }),
      makeActivity({ id: "c", dayDate: "2026-10-03", startTime: "2026-10-03T09:00:00Z" }),
    ];
    const result = buildTimeline(activities, { scope: "upcoming", today: "2026-09-04", limit: 2 });

    expect(result.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("excludes soft-deleted activities", () => {
    const activities = [
      makeActivity({ id: "gone", dayDate: "2026-10-01", deletedAt: "2026-10-01T00:00:00Z" }),
      makeActivity({ id: "kept", dayDate: "2026-10-01" }),
    ];
    const result = buildTimeline(activities, { scope: "upcoming", today: "2026-09-04", limit: 3 });

    expect(result.map((item) => item.id)).toEqual(["kept"]);
  });
});
