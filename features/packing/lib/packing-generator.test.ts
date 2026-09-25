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
  it("displays the standard item catalog across the packing categories", () => {
    const result = generatePackingDrafts(baseInput);
    expect(names(result)).toEqual(
      expect.arrayContaining([
        "Passport / ID",
        "Visa / travel authorization",
        "Credit / debit cards",
        "Phone charger",
        "Headphones / earbuds",
        "Toothbrush",
        "Personal medications",
        "Backpack / daypack",
        "Packing cubes",
        "Casual shoes",
        "Sandals",
        "Travel adapter",
        "Power bank",
        "Toiletry kit",
        "Pain relievers",
        "Light jacket",
        "Document copies",
      ]),
    );
  });

  it.each([
    [3, { underwear: 5, socks: 5, tops: 3, bottoms: 2, sleepwear: 2 }],
    [5, { underwear: 7, socks: 7, tops: 5, bottoms: 3, sleepwear: 2 }],
    [7, { underwear: 9, socks: 9, tops: 7, bottoms: 4, sleepwear: 2 }],
  ])("uses duration-based clothing quantities for a %d-day trip", (durationDays, expected) => {
    const result = generatePackingDrafts({ ...baseInput, durationDays });
    const quantityFor = (name: string) => result.find((draft) => draft.name === name)?.quantity;

    expect(quantityFor("Underwear")).toBe(expected.underwear);
    expect(quantityFor("Socks")).toBe(expected.socks);
    expect(quantityFor("Shirts / tops")).toBe(expected.tops);
    expect(quantityFor("Pants / bottoms")).toBe(expected.bottoms);
    expect(quantityFor("Sleepwear")).toBe(expected.sleepwear);
  });

  it("defaults non-clothing essentials to one", () => {
    const result = generatePackingDrafts(baseInput);
    expect(result.filter((draft) => draft.reason === "always").every((draft) => draft.quantity === 1)).toBe(true);
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

  it("uses one canonical walking-shoes suggestion", () => {
    const result = generatePackingDrafts(baseInput);
    const namesList = names(result);

    expect(namesList).toContain("Walking shoes");
    expect(namesList).not.toContain("Comfortable shoes");
    expect(namesList).not.toContain("Comfortable walking shoes");
    expect(namesList.filter((name) => name === "Walking shoes")).toHaveLength(1);
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
      expect.arrayContaining(["Hiking gear", "Hiking shoes", "Backpack / daypack", "Water bottle"]),
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
        (a, b) => ["documents", "electronics", "toiletries", "clothing", "gear", "activityGear"].indexOf(a) - ["documents", "electronics", "toiletries", "clothing", "gear", "activityGear"].indexOf(b),
      ),
    );
  });
});
