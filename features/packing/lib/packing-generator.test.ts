import { describe, expect, it } from "vitest";

import {
  generatePackingDrafts,
  inferTemperatureProfile,
  tripDurationDays,
} from "@/features/packing/lib/packing-generator";
import type { PackingGenerationInput } from "@/features/packing/domain/packing-types";

const baseInput: PackingGenerationInput = {
  durationDays: 5,
  startDate: "2026-06-15",
  latitude: 40,
  activities: [],
  weatherWarnings: [],
};

function names(drafts: { name: string }[]): string[] {
  return drafts.map((draft) => draft.name);
}

describe("tripDurationDays", () => {
  it("computes the nightly count between two ISO dates", () => {
    expect(tripDurationDays("2026-06-01", "2026-06-08")).toBe(7);
  });

  it("returns null when either date is missing", () => {
    expect(tripDurationDays(null, "2026-06-08")).toBeNull();
    expect(tripDurationDays("2026-06-01", null)).toBeNull();
  });

  it("returns null for an inverted date range", () => {
    expect(tripDurationDays("2026-06-08", "2026-06-01")).toBeNull();
  });
});

describe("inferTemperatureProfile", () => {
  it("is always cold above 60° latitude", () => {
    expect(inferTemperatureProfile(70, "2026-07-01")).toBe("cold");
    expect(inferTemperatureProfile(-70, "2026-01-01")).toBe("cold");
  });

  it("is hot near the equator year-round", () => {
    expect(inferTemperatureProfile(10, "2026-01-01")).toBe("hot");
    expect(inferTemperatureProfile(10, "2026-07-01")).toBe("hot");
  });

  it("flips winter/summer for opposite hemispheres at mid latitudes", () => {
    // Northern winter (January) at 50°N is cold; southern winter (July) at 50°S is also cold.
    expect(inferTemperatureProfile(50, "2026-01-15")).toBe("cold");
    expect(inferTemperatureProfile(-50, "2026-07-15")).toBe("cold");
    // Northern summer (July) at 50°N is mild.
    expect(inferTemperatureProfile(50, "2026-07-15")).toBe("mild");
  });

  it("falls back to mild when latitude is unknown", () => {
    expect(inferTemperatureProfile(null, "2026-06-15")).toBe("mild");
  });
});

describe("generatePackingDrafts", () => {
  it("always includes documents and core electronics", () => {
    const result = generatePackingDrafts(baseInput);
    expect(names(result)).toEqual(
      expect.arrayContaining([
        "Passport / ID",
        "Travel insurance",
        "Booking confirmations",
        "Phone charger",
        "Portable battery",
      ]),
    );
  });

  it("scales clothing quantity with trip length", () => {
    const short = generatePackingDrafts({ ...baseInput, durationDays: 2 });
    const long = generatePackingDrafts({ ...baseInput, durationDays: 10 });
    const underwearFor = (drafts: { name: string; quantity: number }[]) =>
      drafts.find((d) => d.name === "Underwear")?.quantity ?? 0;
    expect(underwearFor(long)).toBeGreaterThan(underwearFor(short));
  });

  it("adds cold-weather clothing for a cold climate", () => {
    const result = generatePackingDrafts({ ...baseInput, latitude: 65, startDate: "2026-01-15" });
    expect(names(result)).toEqual(
      expect.arrayContaining(["Heavy jacket / coat", "Gloves", "Beanie / hat"]),
    );
  });

  it("adds hot-weather gear for a tropical climate", () => {
    const result = generatePackingDrafts({ ...baseInput, latitude: 10, startDate: "2026-03-01" });
    expect(names(result)).toEqual(
      expect.arrayContaining(["Sunscreen", "Sun hat", "Swimwear"]),
    );
  });

  it("adds rain gear when a heavyRain warning is present", () => {
    const result = generatePackingDrafts({
      ...baseInput,
      weatherWarnings: [{ type: "heavyRain", severity: "high" }],
    });
    expect(names(result)).toEqual(expect.arrayContaining(["Rain jacket", "Umbrella"]));
  });

  it("adds purpose-built gear for matching activities", () => {
    const result = generatePackingDrafts({
      ...baseInput,
      activities: [{ category: "outdoors", title: "Hiking in the mountains" }],
    });
    expect(names(result)).toEqual(
      expect.arrayContaining(["Hiking shoes", "Daypack", "Water bottle"]),
    );
  });

  it("deduplicates items that would otherwise repeat across rules", () => {
    // Swimwear from both climate (hot) and a beach activity must appear once.
    const result = generatePackingDrafts({
      ...baseInput,
      latitude: 10,
      startDate: "2026-03-01",
      activities: [{ category: "outdoors", title: "Beach day" }],
    });
    const swimwear = result.filter((d) => d.name === "Swimwear");
    expect(swimwear).toHaveLength(1);
  });

  it("produces a stable ordering grouped by category position", () => {
    const result = generatePackingDrafts(baseInput);
    const categories = result.map((d) => d.category);
    expect(categories).toEqual(
      [...categories].sort(
        (a, b) => ["documents", "electronics", "clothing", "gear"].indexOf(a) - ["documents", "electronics", "clothing", "gear"].indexOf(b),
      ),
    );
  });
});
