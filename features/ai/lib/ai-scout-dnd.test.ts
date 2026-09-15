import { describe, expect, it } from "vitest";

import type { AiScoutSuggestion } from "@/features/ai/domain/ai-scout-types";
import {
  defaultStartTimeFor,
  parseScoutDataTransfer,
  SCOUT_DND_MIME,
  scoutDndData,
  scoutPayloadFromSuggestion,
} from "@/features/ai/lib/ai-scout-dnd";

const suggestion: AiScoutSuggestion = {
  title: "Sunset rooftop bar",
  category: "nightlife",
  categoryTag: "Bar & Nightlife",
  description: "Craft cocktails above the skyline.",
  durationLabel: "1.5 hours",
  timeOfDay: "evening",
  timeTier: "quick-hit",
  transitNote: "3 min walk from the metro.",
  location: "Rooftop 42",
  estimatedCostMinor: 3_500n,
  costTier: "$$$",
};

describe("defaultStartTimeFor", () => {
  it("maps recommended times of day to a start time", () => {
    expect(defaultStartTimeFor("morning")).toBe("09:00");
    expect(defaultStartTimeFor("afternoon")).toBe("14:00");
    expect(defaultStartTimeFor("evening")).toBe("19:00");
    expect(defaultStartTimeFor("any")).toBeNull();
  });
});

describe("scoutPayloadFromSuggestion / scoutDndData / parseScoutDataTransfer", () => {
  it("serializes and parses a suggestion round-trip", () => {
    const data = scoutDndData(suggestion);
    const payload = scoutPayloadFromSuggestion(suggestion);

    expect(payload).toEqual({
      title: "Sunset rooftop bar",
      description: "Craft cocktails above the skyline.",
      location: "Rooftop 42",
      category: "nightlife",
      estimatedCostMinor: "3500",
      defaultStartTime: "19:00",
    });

    const parsed = parseScoutDataTransfer({ getData: () => data } as unknown as DataTransfer);
    expect(parsed).toEqual(payload);
  });

  it("returns null when the payload is not a scout drag", () => {
    const dt = { getData: (mime: string) => (mime === SCOUT_DND_MIME ? "" : "x") } as unknown as DataTransfer;
    expect(parseScoutDataTransfer(dt)).toBeNull();
    expect(parseScoutDataTransfer(null)).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    const dt = { getData: () => "{not json" } as unknown as DataTransfer;
    expect(parseScoutDataTransfer(dt)).toBeNull();
  });

  it("treats a bigint minor-unit cost as a decimal string", () => {
    const data = scoutDndData({ ...suggestion, estimatedCostMinor: 0n });
    const parsed = parseScoutDataTransfer({ getData: () => data } as unknown as DataTransfer);
    expect(parsed?.estimatedCostMinor).toBe("0");
  });
});
