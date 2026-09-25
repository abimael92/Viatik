import { describe, expect, it } from "vitest";

import { isUntouchedSuggestion, packingItemLabel } from "@/features/packing/lib/packing-item-label";
import { translate } from "@/lib/i18n/translations";

describe("packingItemLabel", () => {
  it("translates catalog items and leaves custom names unchanged", () => {
    const t = (key: Parameters<typeof translate>[1]) => translate("es", key);
    expect(packingItemLabel("Travel adapter", t)).toBe("Adaptador de corriente");
    expect(packingItemLabel("Power bank", t)).toBe("Cargador portátil");
    expect(packingItemLabel("Toiletry kit", t)).toBe("Artículos de aseo");
    expect(packingItemLabel("My snorkel", t)).toBe("My snorkel");
  });
});

describe("isUntouchedSuggestion", () => {
  it("shows the badge only for unpacked suggestions still at the generated quantity", () => {
    expect(isUntouchedSuggestion({ name: "Travel adapter", isSuggested: true, isPacked: false, quantity: 1 }, 1)).toBe(true);
    expect(isUntouchedSuggestion({ name: "Passport / ID", isSuggested: true, isPacked: false, quantity: 1, suggestedReason: "always" }, 1)).toBe(true);
    expect(isUntouchedSuggestion({ name: "Phone", isSuggested: true, isPacked: false, quantity: 1, suggestedReason: "always" }, 1)).toBe(true);
    expect(isUntouchedSuggestion({ name: "Power bank", isSuggested: true, isPacked: true, quantity: 1 }, 1)).toBe(false);
    expect(isUntouchedSuggestion({ name: "Light jacket", isSuggested: true, isPacked: false, quantity: 3 }, 1)).toBe(false);
    expect(isUntouchedSuggestion({ name: "Headphones / earbuds", isSuggested: true, isPacked: false, quantity: 1, suggestedReason: "recommended" }, 1)).toBe(false);
    expect(isUntouchedSuggestion({ name: "Travel adapter", isSuggested: false, isPacked: false, quantity: 1 }, 1)).toBe(false);
  });
});
