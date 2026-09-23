import { describe, expect, it } from "vitest";

import { formatTimeInZone, getTemporalState } from "@/features/trips/lib/home-trips";

const now = new Date("2024-06-15T12:00:00Z");

describe("formatTimeInZone", () => {
  it("preserves schedule wall-clock digits even when sync added a Z suffix", () => {
    expect(formatTimeInZone("2024-06-15T10:00:00Z", "America/New_York")).toBe("10:00");
    expect(formatTimeInZone("2024-06-15T10:00:00Z", "Asia/Tokyo")).toBe("10:00");
  });

  it("preserves naive destination-local wall times", () => {
    expect(formatTimeInZone("2024-06-15T18:30:00", "Europe/Lisbon")).toBe("18:30");
  });

  it("handles missing and invalid values", () => {
    expect(formatTimeInZone(null, "America/New_York")).toBeNull();
    expect(formatTimeInZone("2024-06-15T10:00:00Z", "Invalid/Timezone")).toBe("10:00");
  });
});

describe("getTemporalState", () => {
  it("classifies future, current, and past activities", () => {
    expect(getTemporalState({ startTime: "2024-06-15T14:00:00Z", endTime: "2024-06-15T16:00:00Z", dayDate: "2024-06-15" }, now, "UTC")).toBe("future");
    expect(getTemporalState({ startTime: "2024-06-15T10:00:00Z", endTime: "2024-06-15T13:00:00Z", dayDate: "2024-06-15" }, now, "UTC")).toBe("current");
    expect(getTemporalState({ startTime: "2024-06-15T08:00:00Z", endTime: "2024-06-15T10:00:00Z", dayDate: "2024-06-15" }, now, "UTC")).toBe("past");
  });

  it("uses a thirty-minute duration when no end time exists", () => {
    const activity = { startTime: "2024-06-15T10:00:00Z", endTime: null, dayDate: "2024-06-15" };
    expect(getTemporalState(activity, new Date("2024-06-15T10:15:00Z"), "UTC")).toBe("current");
    expect(getTemporalState(activity, new Date("2024-06-15T10:45:00Z"), "UTC")).toBe("past");
  });

  it("keeps untimed activities visible as future", () => {
    expect(getTemporalState({ startTime: null, endTime: null, dayDate: "2024-06-15" }, now, "UTC")).toBe("future");
  });

  it("handles destination-local times and activities spanning midnight", () => {
    expect(getTemporalState({ startTime: "2024-06-15T18:30:00", endTime: null, dayDate: "2024-06-15" }, new Date("2024-06-15T22:03:00Z"), "Europe/Lisbon")).toBe("past");
    const overnight = { startTime: "2024-06-15T23:00:00Z", endTime: "2024-06-16T01:00:00Z", dayDate: "2024-06-15" };
    expect(getTemporalState(overnight, new Date("2024-06-15T22:00:00Z"), "UTC")).toBe("future");
    expect(getTemporalState(overnight, new Date("2024-06-16T00:30:00Z"), "UTC")).toBe("current");
    expect(getTemporalState(overnight, new Date("2024-06-16T02:00:00Z"), "UTC")).toBe("past");
  });

  it("treats synced Z suffixes as trip wall-clock when a destination timezone is set", () => {
    // Traveler entered 17:00 in Lisbon; after sync the string is "...Z" but still means 17:00 Lisbon.
    const activity = {
      startTime: "2026-09-23T17:00:00.000Z",
      endTime: "2026-09-23T18:00:00.000Z",
      dayDate: "2026-09-23",
    };
    expect(getTemporalState(activity, new Date("2026-09-23T15:30:00.000Z"), "Europe/Lisbon")).toBe("future");
    expect(getTemporalState(activity, new Date("2026-09-23T16:30:00.000Z"), "Europe/Lisbon")).toBe("current");
    expect(getTemporalState(activity, new Date("2026-09-23T18:30:00.000Z"), "Europe/Lisbon")).toBe("past");
  });

  it("treats synced Z suffixes as destination wall-clock in Mexico City", () => {
    const bailar = {
      startTime: "2026-09-23T21:00:00.000Z",
      endTime: null,
      dayDate: "2026-09-23",
    };
    const afternoon = {
      startTime: "2026-09-23T17:00:00.000Z",
      endTime: "2026-09-23T18:00:00.000Z",
      dayDate: "2026-09-23",
    };
    // 16:50 America/Mexico_City (UTC-6) == 22:50Z — evening stops must still be future.
    const now = new Date("2026-09-23T22:50:00.000Z");
    expect(getTemporalState(bailar, now, "America/Mexico_City")).toBe("future");
    expect(getTemporalState(afternoon, now, "America/Mexico_City")).toBe("future");
  });

  it("does not treat wall-clock digits as absolute UTC", () => {
    const activity = {
      startTime: "2026-09-23T21:00:00.000Z",
      endTime: null,
      dayDate: "2026-09-23",
    };
    // 20:00 Mexico (02:00Z next day) — still before 21:00
    expect(getTemporalState(activity, new Date("2026-09-24T02:00:00.000Z"), "America/Mexico_City")).toBe("future");
    // 21:15 Mexico (03:15Z next day) — inside the default 30-minute window
    expect(getTemporalState(activity, new Date("2026-09-24T03:15:00.000Z"), "America/Mexico_City")).toBe("current");
  });

  it("returns future for invalid dates", () => {
    expect(getTemporalState({ startTime: "invalid", endTime: "invalid", dayDate: "2024-06-15" }, now, "UTC")).toBe("future");
  });
});
