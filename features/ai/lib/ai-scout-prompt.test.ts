import { describe, expect, it } from "vitest";

import {
  buildScoutPrompt,
  buildTripDates,
  formatScoutDay,
  SCOUT_ACTIVITIES_INSTRUCTION,
} from "@/features/ai/lib/ai-scout-prompt";

describe("buildScoutPrompt", () => {
  it("injects the destination and date range into the instruction", () => {
    const prompt = buildScoutPrompt("Kyoto", "Sep 6 – Sep 12, 2026");
    expect(prompt).toContain("For destination Kyoto during Sep 6 – Sep 12, 2026");
    expect(prompt).not.toContain("[Destination]");
    expect(prompt).not.toContain("[Dates]");
  });

  it("retains the full structured instruction", () => {
    const prompt = buildScoutPrompt("Kyoto", "Sep 6 – Sep 12, 2026");
    expect(prompt).toBe(
      SCOUT_ACTIVITIES_INSTRUCTION
        .replace("[Destination]", "Kyoto")
        .replace("[Dates]", "Sep 6 – Sep 12, 2026"),
    );
  });

  it("uses friendly placeholders when destination or dates are missing", () => {
    expect(buildScoutPrompt("", "")).toContain("For destination your destination during your trip dates");
    expect(buildScoutPrompt("Paris", "")).toContain("For destination Paris during your trip dates");
  });
});

describe("buildTripDates", () => {
  it("formats a multi-day range compactly", () => {
    expect(buildTripDates(["2026-09-06", "2026-09-07", "2026-09-12"])).toBe("Sep 6 – Sep 12, 2026");
  });

  it("returns just the day for a single-day trip", () => {
    expect(buildTripDates(["2026-09-06"])).toBe(formatScoutDay("2026-09-06"));
  });

  it("includes the year when the range spans years", () => {
    expect(buildTripDates(["2026-12-30", "2027-01-02"])).toContain("2026");
    expect(buildTripDates(["2026-12-30", "2027-01-02"])).toContain("2027");
  });

  it("returns an empty string for no days", () => {
    expect(buildTripDates([])).toBe("");
  });
});
