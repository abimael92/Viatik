import { describe, expect, it } from "vitest";

import { scoutBudgetPresets } from "@/features/trip-planner/domain/scout-budget-presets";

describe("scoutBudgetPresets", () => {
  it("returns three whole-unit presets in minor units", () => {
    expect(scoutBudgetPresets("USD")).toEqual([10_000n, 25_000n, 50_000n]);
    expect(scoutBudgetPresets("EUR")).toEqual([10_000n, 25_000n, 50_000n]);
  });

  it("scales the presets to the local currency instead of reusing dollars", () => {
    expect(scoutBudgetPresets("MXN")).toEqual([180_000n, 450_000n, 900_000n]);
    expect(scoutBudgetPresets("GBP")).toEqual([8_000n, 20_000n, 40_000n]);
  });

  it("keeps zero-decimal currencies in whole units", () => {
    expect(scoutBudgetPresets("JPY")).toEqual([15_000n, 37_500n, 75_000n]);
  });

  it("accepts lowercase codes and omits presets for unsupported currencies", () => {
    expect(scoutBudgetPresets("cad")).toEqual([13_500n, 34_000n, 67_500n]);
    expect(scoutBudgetPresets("CHF")).toEqual([]);
  });
});
