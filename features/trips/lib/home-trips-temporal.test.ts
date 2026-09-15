import { describe, expect, it } from "vitest";

import { formatTimeInZone, getTemporalState } from "@/features/trips/lib/home-trips";

const now = new Date("2024-06-15T12:00:00Z");

describe("formatTimeInZone", () => {
  it("formats absolute times in the destination timezone", () => {
    expect(formatTimeInZone("2024-06-15T10:00:00Z", "America/New_York")).toBe("06:00");
    expect(formatTimeInZone("2024-06-15T10:00:00Z", "Asia/Tokyo")).toBe("19:00");
  });

  it("preserves naive destination-local wall times", () => {
    expect(formatTimeInZone("2024-06-15T18:30:00", "Europe/Lisbon")).toBe("18:30");
  });

  it("handles missing and invalid values", () => {
    expect(formatTimeInZone(null, "America/New_York")).toBeNull();
    expect(formatTimeInZone("2024-06-15T10:00:00Z", "Invalid/Timezone")).not.toBeNull();
  });
});

describe("getTemporalState", () => {
  it("classifies future, current, and past activities", () => {
    expect(getTemporalState({ startTime: "2024-06-15T14:00:00Z", endTime: "2024-06-15T16:00:00Z", dayDate: "2024-06-15" }, now)).toBe("future");
    expect(getTemporalState({ startTime: "2024-06-15T10:00:00Z", endTime: "2024-06-15T13:00:00Z", dayDate: "2024-06-15" }, now)).toBe("current");
    expect(getTemporalState({ startTime: "2024-06-15T08:00:00Z", endTime: "2024-06-15T10:00:00Z", dayDate: "2024-06-15" }, now)).toBe("past");
  });

  it("uses a thirty-minute duration when no end time exists", () => {
    const activity = { startTime: "2024-06-15T10:00:00Z", endTime: null, dayDate: "2024-06-15" };
    expect(getTemporalState(activity, new Date("2024-06-15T10:15:00Z"))).toBe("current");
    expect(getTemporalState(activity, new Date("2024-06-15T10:45:00Z"))).toBe("past");
  });

  it("keeps untimed activities visible as future", () => {
    expect(getTemporalState({ startTime: null, endTime: null, dayDate: "2024-06-15" }, now)).toBe("future");
  });

  it("handles destination-local times and activities spanning midnight", () => {
    expect(getTemporalState({ startTime: "2024-06-15T18:30:00", endTime: null, dayDate: "2024-06-15" }, new Date("2024-06-15T22:03:00Z"), "Europe/Lisbon")).toBe("past");
    const overnight = { startTime: "2024-06-15T23:00:00Z", endTime: "2024-06-16T01:00:00Z", dayDate: "2024-06-15" };
    expect(getTemporalState(overnight, new Date("2024-06-15T22:00:00Z"))).toBe("future");
    expect(getTemporalState(overnight, new Date("2024-06-16T00:30:00Z"))).toBe("current");
    expect(getTemporalState(overnight, new Date("2024-06-16T02:00:00Z"))).toBe("past");
  });

  it("returns future for invalid dates", () => {
    expect(getTemporalState({ startTime: "invalid", endTime: "invalid", dayDate: "2024-06-15" }, now)).toBe("future");
  });
});
