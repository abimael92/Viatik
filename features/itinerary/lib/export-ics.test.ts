import { describe, it, expect } from "vitest";
import { activitiesToIcs, downloadActivitiesIcs } from "./export-ics";
import type { Activity } from "@/features/domain/entities";

const mockActivities: Activity[] = [
  {
    id: "act-1",
    tripId: "trip-1",
    dayDate: "2024-06-15",
    title: "Visit museum",
    description: "Modern art museum",
    location: "123 Museum St",
    latitude: 40.7128,
    longitude: -74.006,
    category: "activities",
    startTime: "2024-06-15T10:00:00Z",
    endTime: "2024-06-15T13:00:00Z",
    position: 0,
    estimatedCostMinor: 2000n,
    createdBy: "user-1",
    createdAt: "2024-06-01T12:00:00Z",
    updatedAt: "2024-06-01T12:00:00Z",
    deletedAt: null,
  },
  {
    id: "act-2",
    tripId: "trip-1",
    dayDate: "2024-06-15",
    title: "Lunch",
    description: "Nice restaurant",
    location: "456 Food Ave",
    latitude: null,
    longitude: null,
    category: "food",
    startTime: "2024-06-15T13:30:00Z",
    endTime: "2024-06-15T15:00:00Z",
    position: 1,
    estimatedCostMinor: 3000n,
    createdBy: "user-1",
    createdAt: "2024-06-01T12:00:00Z",
    updatedAt: "2024-06-01T12:00:00Z",
    deletedAt: null,
  },
  {
    id: "act-3",
    tripId: "trip-1",
    dayDate: "2024-06-16",
    title: "Flight home",
    description: "Departure",
    location: "JFK Airport",
    latitude: 40.6413,
    longitude: -73.7781,
    category: "transport",
    startTime: "2024-06-16T18:00:00Z",
    endTime: "2024-06-16T22:00:00Z",
    position: 0,
    estimatedCostMinor: null,
    createdBy: "user-1",
    createdAt: "2024-06-01T12:00:00Z",
    updatedAt: "2024-06-01T12:00:00Z",
    deletedAt: null,
  },
];

describe("activitiesToIcs", () => {
  it("generates valid iCalendar with all events", () => {
    const ics = activitiesToIcs(mockActivities, "Paris Trip");

    // Check VCALENDAR structure
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("PRODID:-//Viatik//Trip Itinerary//EN");
    expect(ics).toContain("END:VCALENDAR");

    // Check calendar name
    expect(ics).toContain("X-WR-CALNAME:Paris Trip");

    // Check events (3 activities)
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");

    // Check specific event content
    expect(ics).toContain("UID:act-1@viatik.app");
    expect(ics).toContain("SUMMARY:Visit museum");
    expect(ics).toContain("DESCRIPTION:Modern art museum\\nLocation: 123 Museum St\\nCategory: activities");
    expect(ics).toContain("LOCATION:123 Museum St");

    expect(ics).toContain("UID:act-2@viatik.app");
    expect(ics).toContain("SUMMARY:Lunch");
    expect(ics).toContain("DESCRIPTION:Nice restaurant\\nLocation: 456 Food Ave\\nCategory: food");
    expect(ics).toContain("LOCATION:456 Food Ave");

    expect(ics).toContain("UID:act-3@viatik.app");
    expect(ics).toContain("SUMMARY:Flight home");
    expect(ics).toContain("DESCRIPTION:Departure\\nLocation: JFK Airport\\nCategory: transport");
    expect(ics).toContain("LOCATION:JFK Airport");
  });

  it("handles activities without start/end time (all-day events)", () => {
    const allDayActivity: Activity = {
      ...mockActivities[0],
      id: "act-allday",
      startTime: null,
      endTime: null,
    };
    const ics = activitiesToIcs([allDayActivity], "Test Trip");

    // Should use DATE format (YYYYMMDD) for all-day events
    expect(ics).toContain("DTSTART:20240615");
    expect(ics).toContain("DTEND:20240615");
  });

  it("handles activities with only start time", () => {
    const startOnlyActivity: Activity = {
      ...mockActivities[0],
      id: "act-startonly",
      endTime: null,
    };
    const ics = activitiesToIcs([startOnlyActivity], "Test Trip");

    // Should default to 1 hour duration
    expect(ics).toContain("DTSTART:20240615T100000Z");
    expect(ics).toContain("DTEND:20240615T110000Z");
  });

  it("skips deleted activities", () => {
    const deletedActivity: Activity = {
      ...mockActivities[0],
      id: "act-deleted",
      deletedAt: "2024-06-10T12:00:00Z",
    };
    const ics = activitiesToIcs([mockActivities[0], deletedActivity], "Test Trip");

    expect(ics).toContain("UID:act-1@viatik.app");
    expect(ics).not.toContain("UID:act-deleted@viatik.app");
  });

  it("sorts events by dayDate then position", () => {
    const ics = activitiesToIcs(mockActivities, "Test Trip");

    // First event should be act-1 (June 15, position 0)
    const firstEventStart = ics.indexOf("UID:act-1@viatik.app");
    const secondEventStart = ics.indexOf("UID:act-2@viatik.app");
    const thirdEventStart = ics.indexOf("UID:act-3@viatik.app");

    expect(firstEventStart).toBeLessThan(secondEventStart);
    expect(secondEventStart).toBeLessThan(thirdEventStart);
  });

  it("escapes special characters in description", () => {
    const activityWithSpecialChars: Activity = {
      ...mockActivities[0],
      id: "act-special",
      description: "Line 1\nLine 2, with comma; semicolon",
    };
    const ics = activitiesToIcs([activityWithSpecialChars], "Test Trip");

    expect(ics).toContain("DESCRIPTION:Line 1\\nLine 2\\, with comma\\; semicolon");
  });
});

describe("downloadActivitiesIcs", () => {
  it("creates blob and triggers download (smoke test)", () => {
    // Just verify the function runs without throwing
    // (Full DOM mocking is complex in vitest/jsdom)
    expect(() => downloadActivitiesIcs(mockActivities, "Test Trip")).not.toThrow();
    expect(() => downloadActivitiesIcs([], "Empty Trip")).not.toThrow();
  });
});