import { describe, expect, it } from "vitest";

import {
  isPurchaseOrientedMustDo,
  spendingCategoryFromActivity,
} from "@/features/activities/lib/activity-expense-defaults";

describe("isPurchaseOrientedMustDo", () => {
  it("matches bilingual purchase titles", () => {
    expect(isPurchaseOrientedMustDo("Pagar estacionamiento")).toBe(true);
    expect(isPurchaseOrientedMustDo("Comprar entradas")).toBe(true);
    expect(isPurchaseOrientedMustDo("Buy museum tickets")).toBe(true);
    expect(isPurchaseOrientedMustDo("Pay parking fee")).toBe(true);
  });

  it("rejects non-purchase tasks", () => {
    expect(isPurchaseOrientedMustDo("Meet guide")).toBe(false);
    expect(isPurchaseOrientedMustDo("Pack bags")).toBe(false);
    expect(isPurchaseOrientedMustDo("   ")).toBe(false);
  });
});

describe("spendingCategoryFromActivity", () => {
  it("maps itinerary categories onto spending categories", () => {
    expect(spendingCategoryFromActivity("transit")).toBe("transport");
    expect(spendingCategoryFromActivity("lodging")).toBe("stay");
    expect(spendingCategoryFromActivity("food-and-drink")).toBe("food");
    expect(spendingCategoryFromActivity("sightseeing")).toBe("activities");
    expect(spendingCategoryFromActivity("entertainment")).toBe("activities");
    expect(spendingCategoryFromActivity("active")).toBe("activities");
    expect(spendingCategoryFromActivity("shopping")).toBe("shopping");
    expect(spendingCategoryFromActivity("general")).toBeNull();
    expect(spendingCategoryFromActivity(null)).toBeNull();
  });
});
