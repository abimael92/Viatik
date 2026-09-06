import { describe, it, expect } from "vitest";

import type { Activity, Expense } from "@/features/domain/entities";
import type { TripMedia } from "@/features/domain/entities-media";
import {
  buildDailyTimeline,
  computeTripSummary,
  inclusiveDayCount,
  type JournalDay,
} from "./journal-aggregator";

function activity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: "activity-1",
    tripId: "trip-1",
    dayDate: "2026-07-01",
    title: "Hike",
    description: null,
    location: null,
    category: "general",
    startTime: null,
    endTime: null,
    position: 0,
    estimatedCostMinor: null,
    createdBy: "u1",
    createdAt: "2026-07-01T10:00:00.000Z",
    updatedAt: "2026-07-01T10:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "expense-1",
    tripId: "trip-1",
    activityId: null,
    description: "Lunch",
    amountMinor: 1000n,
    currency: "USD",
    exchangeRateToBase: null,
    paidBy: "u1",
    splitType: "equal",
    categoryId: null,
    date: "2026-07-01",
    createdBy: "u1",
    createdAt: "2026-07-01T12:00:00.000Z",
    updatedAt: "2026-07-01T12:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

function media(overrides: Partial<TripMedia> = {}): TripMedia {
  return {
    id: "photo-1",
    tripId: "trip-1",
    activityId: null,
    caption: null,
    takenAt: "2026-07-01",
    blob: null,
    storagePath: "trip-1/photo-1.jpg",
    uploadedUrl: null,
    signedUrlExpiresAt: null,
    contentType: "image/jpeg",
    byteSize: 0,
    createdBy: "u1",
    uploadStatus: "uploaded",
    uploadProgress: 100,
    uploadError: null,
    uploadAttempts: 0,
    nextUploadAt: null,
    createdAt: "2026-07-01T09:00:00.000Z",
    updatedAt: "2026-07-01T09:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

describe("buildDailyTimeline", () => {
  it("returns an empty timeline for no data", () => {
    expect(buildDailyTimeline([], [], [], "USD")).toEqual([]);
  });

  it("groups activities, expenses, and photos that share a date", () => {
    const days = buildDailyTimeline(
      [activity({ id: "a1" })],
      [expense({ id: "e1" })],
      [media({ id: "p1" })],
      "USD"
    );
    expect(days).toHaveLength(1);
    const day = days[0];
    expect(day.date).toBe("2026-07-01");
    expect(day.activityCount).toBe(1);
    expect(day.expenseCount).toBe(1);
    expect(day.photoCount).toBe(1);
    expect(day.activities[0].id).toBe("a1");
    expect(day.expenses[0].id).toBe("e1");
    expect(day.photos[0].id).toBe("p1");
  });

  it("splits items across distinct dates into separate days, sorted ascending", () => {
    const days = buildDailyTimeline(
      [activity({ id: "a2", dayDate: "2026-07-02" }), activity({ id: "a1", dayDate: "2026-07-01" })],
      [],
      [],
      "USD"
    );
    expect(days.map((day) => day.date)).toEqual(["2026-07-01", "2026-07-02"]);
  });

  it("keeps only days that contain data (no blank days emitted)", () => {
    // A trip spanning 07-01 → 07-05 with data only on 07-01 and 07-05.
    const days = buildDailyTimeline(
      [activity({ id: "a1", dayDate: "2026-07-01" }), activity({ id: "a5", dayDate: "2026-07-05" })],
      [],
      [],
      "USD"
    );
    expect(days.map((day) => day.date)).toEqual(["2026-07-01", "2026-07-05"]);
  });

  it("excludes soft-deleted activities, expenses, and media", () => {
    const days = buildDailyTimeline(
      [activity({ id: "gone", deletedAt: "2026-07-02T00:00:00.000Z" })],
      [expense({ id: "gone", deletedAt: "2026-07-02T00:00:00.000Z" })],
      [media({ id: "gone", deletedAt: "2026-07-02T00:00:00.000Z" })],
      "USD"
    );
    expect(days).toEqual([]);
  });

  it("falls back to createdAt date when a photo has no takenAt", () => {
    const days = buildDailyTimeline([], [], [media({ takenAt: null, createdAt: "2026-07-09T14:00:00.000Z" })], "USD");
    expect(days).toHaveLength(1);
    expect(days[0].date).toBe("2026-07-09");
    expect(days[0].photoCount).toBe(1);
  });

  it("skips photos with neither takenAt nor createdAt", () => {
    const days = buildDailyTimeline([], [], [media({ takenAt: null, createdAt: "" })], "USD");
    expect(days).toEqual([]);
  });

  it("sums a day's convertible expenses into the base currency", () => {
    const days = buildDailyTimeline(
      [],
      [
        expense({ id: "e1", amountMinor: 1000n, currency: "USD" }),
        expense({ id: "e2", amountMinor: 2500n, currency: "USD" }),
      ],
      [],
      "USD"
    );
    expect(days[0].totalSpentMinor).toBe(3500n);
  });

  it("converts foreign-currency expenses into the base currency for daily totals", () => {
    const days = buildDailyTimeline(
      [],
      [expense({ id: "e1", amountMinor: 10000n, currency: "EUR", exchangeRateToBase: 1.1 })],
      [],
      "USD"
    );
    expect(days[0].totalSpentMinor).toBe(11000n);
  });

  it("skips un-convertible foreign expenses from the daily total", () => {
    const days = buildDailyTimeline(
      [],
      [expense({ id: "e1", amountMinor: 10000n, currency: "EUR", exchangeRateToBase: null })],
      [],
      "USD"
    );
    expect(days[0].totalSpentMinor).toBe(0n);
    expect(days[0].expenseCount).toBe(1); // the expense still appears in the feed
  });

  it("handles overlapping data across multiple days with independent totals", () => {
    const days = buildDailyTimeline(
      [
        activity({ id: "a1", dayDate: "2026-07-01" }),
        activity({ id: "a2", dayDate: "2026-07-02" }),
      ],
      [
        expense({ id: "e1", date: "2026-07-01", amountMinor: 1000n }),
        expense({ id: "e2", date: "2026-07-02", amountMinor: 5000n }),
      ],
      [media({ id: "p2", takenAt: "2026-07-02" })],
      "USD"
    );
    expect(days.map((day) => day.date)).toEqual(["2026-07-01", "2026-07-02"]);
    expect(days[0].totalSpentMinor).toBe(1000n);
    expect(days[0].photoCount).toBe(0);
    expect(days[1].totalSpentMinor).toBe(5000n);
    expect(days[1].photoCount).toBe(1);
  });
});

describe("inclusiveDayCount", () => {
  it("counts a single day as 1", () => {
    expect(inclusiveDayCount("2026-07-01", "2026-07-01")).toBe(1);
  });

  it("counts inclusive range across multiple days", () => {
    expect(inclusiveDayCount("2026-07-01", "2026-07-05")).toBe(5);
  });

  it("returns null when either date is missing", () => {
    expect(inclusiveDayCount(null, "2026-07-05")).toBeNull();
    expect(inclusiveDayCount("2026-07-01", null)).toBeNull();
  });

  it("returns null for an inverted range", () => {
    expect(inclusiveDayCount("2026-07-05", "2026-07-01")).toBeNull();
  });
});

describe("computeTripSummary", () => {
  const days: JournalDay[] = buildDailyTimeline(
    [activity({ id: "a1", dayDate: "2026-07-01" }), activity({ id: "a2", dayDate: "2026-07-02" })],
    [expense({ id: "e1", amountMinor: 1000n, date: "2026-07-01" }), expense({ id: "e2", amountMinor: 5000n, date: "2026-07-02" })],
    [media({ id: "p1", takenAt: "2026-07-01" })],
    "USD"
  );

  it("rolls up totals and uses the inclusive trip date range", () => {
    const summary = computeTripSummary(days, { startDate: "2026-07-01", endDate: "2026-07-05" });
    expect(summary.totalDays).toBe(5);
    expect(summary.totalActivities).toBe(2);
    expect(summary.totalPhotos).toBe(1);
    expect(summary.totalSpentMinor).toBe(6000n);
  });

  it("falls back to distinct journal days when trip dates are unset", () => {
    const summary = computeTripSummary(days, { startDate: null, endDate: null });
    expect(summary.totalDays).toBe(2);
  });

  it("returns zeroed counts for an empty timeline", () => {
    const summary = computeTripSummary([], { startDate: "2026-07-01", endDate: "2026-07-03" });
    expect(summary).toEqual({
      totalDays: 3,
      totalActivities: 0,
      totalPhotos: 0,
      totalSpentMinor: 0n,
      startDate: "2026-07-01",
      endDate: "2026-07-03",
    });
  });
});
