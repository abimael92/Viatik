import { describe, expect, it } from "vitest";

import { selectFallbackCategory } from "@/features/trip-planner/domain/scout-vibe-category";

describe("selectFallbackCategory", () => {
  it("maps a typed vibe to the pool it describes", () => {
    expect(selectFallbackCategory("Slow mornings by the water")).toBe("beach");
    expect(selectFallbackCategory("Fresh mountain air & quiet trails")).toBe("nature");
    expect(selectFallbackCategory("A food-first trip, market to table")).toBe("food");
    expect(selectFallbackCategory("Museums and architecture")).toBe("city");
  });

  it("reads a mixed label as food, which is why the chips declare their own pool", () => {
    expect(selectFallbackCategory("Vibrant streets, culture & good food")).toBe("food");
  });

  it("falls back to the general pool for anything it cannot place", () => {
    expect(selectFallbackCategory("Surprise me — somewhere new")).toBe("default");
    expect(selectFallbackCategory("")).toBe("default");
  });
});
