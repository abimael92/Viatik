import { describe, expect, it } from "vitest";

import { formatRelativeTime } from "@/features/feed/lib/feed-time";

const NOW = Date.parse("2026-06-10T12:00:00.000Z");

describe("formatRelativeTime", () => {
  it("renders just now for recent timestamps", () => {
    expect(formatRelativeTime(new Date(NOW - 5_000).toISOString(), NOW)).toBe("just now");
  });

  it("renders minutes, hours, and days", () => {
    expect(formatRelativeTime(new Date(NOW - 5 * 60_000).toISOString(), NOW)).toBe("5m ago");
    expect(formatRelativeTime(new Date(NOW - 3 * 3600_000).toISOString(), NOW)).toBe("3h ago");
    expect(formatRelativeTime(new Date(NOW - 2 * 86400_000).toISOString(), NOW)).toBe("2d ago");
  });

  it("falls back to a short date after a week", () => {
    const result = formatRelativeTime(new Date(NOW - 30 * 86400_000).toISOString(), NOW, "en-US");
    expect(result).toMatch(/\w{3} \d{1,2}/);
  });

  it("treats future and invalid timestamps gracefully", () => {
    expect(formatRelativeTime(new Date(NOW + 60_000).toISOString(), NOW)).toBe("just now");
    expect(formatRelativeTime("not-a-date", NOW)).toBe("");
  });
});
