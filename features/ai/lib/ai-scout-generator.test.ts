import { describe, expect, it, vi } from "vitest";

import type { AiScoutContext, ScoutProvider } from "@/features/ai/domain/ai-scout-types";
import {
  AiScoutValidationError,
  createHttpScoutProvider,
  generateOfflineSuggestions,
  generateScoutSuggestions,
  validateScoutResult,
} from "@/features/ai/lib/ai-scout-generator";

const baseContext: AiScoutContext = { destination: "Rome", currency: "USD", dayCount: 3 };

describe("validateScoutResult", () => {
  it("normalizes a valid raw payload, converting decimal money to minor units", () => {
    const result = validateScoutResult(
      {
        suggestions: [
          {
            title: "Colosseum",
            category: "culture",
            description: "Ancient arena.",
            durationLabel: "3 hours",
            timeOfDay: "morning",
            transitNote: "Metro line B.",
            location: "Rome",
            estimatedCost: 20.5,
          },
        ],
      },
      "USD",
    );

    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]).toMatchObject({
      title: "Colosseum",
      category: "culture",
      durationLabel: "3 hours",
      timeOfDay: "morning",
      transitNote: "Metro line B.",
      location: "Rome",
    });
    expect(result.suggestions[0].estimatedCostMinor).toBe(2_050n);
  });

  it("accepts bigint minor-unit fields directly", () => {
    const result = validateScoutResult(
      { suggestions: [{ title: "Walk", estimatedCostMinor: 1_000n }] },
      "USD",
    );
    expect(result.suggestions[0].estimatedCostMinor).toBe(1_000n);
  });

  it("maps the structured scout fields (categoryTag, timeTier, costTier)", () => {
    const result = validateScoutResult(
      {
        suggestions: [
          {
            title: "Sunset rooftop bar",
            description: "Craft cocktails above the skyline.",
            costTier: "$$$",
            timeTier: "Quick Hit",
            categoryTag: "Bar & Nightlife",
            transitNote: "3 min walk from the metro.",
          },
        ],
      },
      "USD",
    );
    expect(result.suggestions[0]).toMatchObject({
      categoryTag: "Bar & Nightlife",
      timeTier: "quick-hit",
      costTier: "$$$",
      transitNote: "3 min walk from the metro.",
    });
  });

  it("normalizes time tier synonyms and clamps cost tier bands", () => {
    const result = validateScoutResult(
      {
        suggestions: [
          { title: "A", timeTier: "half session", costTier: "$$$$$" },
          { title: "B", timeTier: "Deep Dive", costTier: "$" },
          { title: "C", timeTier: "unknown", costTier: undefined },
        ],
      },
      "USD",
    );
    expect(result.suggestions[0].timeTier).toBe("half-session");
    expect(result.suggestions[0].costTier).toBe("$$$$");
    expect(result.suggestions[1].timeTier).toBe("deep-dive");
    expect(result.suggestions[2].timeTier).toBe("any");
    expect(result.suggestions[2].costTier).toBeNull();
  });

  it("falls back to category for categoryTag and to the category for the default badge", () => {
    const result = validateScoutResult(
      { suggestions: [{ title: "Walk", category: "food" }] },
      "USD",
    );
    expect(result.suggestions[0].categoryTag).toBe("food");
  });

  it("caps overlong fields and skips items without a title", () => {
    const longTitle = "a".repeat(300);
    const result = validateScoutResult(
      {
        suggestions: [
          { description: "no title here", category: "food" },
          { title: longTitle, description: "x".repeat(800), transitNote: "y".repeat(500) },
        ],
      },
      "USD",
    );

    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].title).toHaveLength(120);
    expect(result.suggestions[0].description).toHaveLength(500);
    expect(result.suggestions[0].transitNote).toHaveLength(160);
  });

  it("normalizes an invalid timeOfDay to 'any'", () => {
    const result = validateScoutResult(
      { suggestions: [{ title: "Walk", timeOfDay: "midnight" }, { title: "Tour", timeOfDay: "evening" }] },
      "USD",
    );
    expect(result.suggestions[0].timeOfDay).toBe("any");
    expect(result.suggestions[1].timeOfDay).toBe("evening");
  });

  it("throws on a non-object container", () => {
    expect(() => validateScoutResult(null, "USD")).toThrow(AiScoutValidationError);
    expect(() => validateScoutResult("nope", "USD")).toThrow(AiScoutValidationError);
  });

  it("throws when the suggestions array is missing", () => {
    expect(() => validateScoutResult({ items: [] }, "USD")).toThrow(AiScoutValidationError);
  });

  it("throws on an unsupported currency", () => {
    expect(() => validateScoutResult({ suggestions: [] }, "XYZ")).toThrow(AiScoutValidationError);
  });

  it("throws on an invalid amount", () => {
    expect(() =>
      validateScoutResult({ suggestions: [{ title: "Tour", estimatedCost: "abc" }] }, "USD"),
    ).toThrow(AiScoutValidationError);
  });
});

describe("generateOfflineSuggestions", () => {
  it("is destination-aware and returns suggestion metadata", () => {
    const suggestions = generateOfflineSuggestions("must-see landmarks", baseContext);
    expect(suggestions.length).toBeGreaterThan(0);
    for (const suggestion of suggestions) {
      expect(suggestion.title).toBeTruthy();
      expect(suggestion.durationLabel).toBeTruthy();
      expect(["morning", "afternoon", "evening", "any"]).toContain(suggestion.timeOfDay);
      expect(suggestion.estimatedCostMinor).toBeTypeOf("bigint");
      expect(suggestion.categoryTag).toBeTruthy();
      expect(["quick-hit", "half-session", "deep-dive", "any"]).toContain(suggestion.timeTier);
      expect(suggestion.costTier).toMatch(/^\${1,4}$/);
    }
  });

  it("uses a Kyoto-specific pool for Kyoto", () => {
    const suggestions = generateOfflineSuggestions("food", {
      destination: "Kyoto",
      currency: "JPY",
      dayCount: 3,
    });
    expect(suggestions.some((item) => /Fushimi Inari/i.test(item.title))).toBe(true);
  });

  it("falls back to the generic pool for unknown destinations", () => {
    const suggestions = generateOfflineSuggestions("anything", {
      destination: "Timbuktu",
      currency: "USD",
      dayCount: 3,
    });
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it("orders food suggestions first when the prompt mentions food", () => {
    const suggestions = generateOfflineSuggestions("great local food", baseContext);
    expect(suggestions[0].category).toBe("food");
  });

  it("caps the number of suggestions", () => {
    const suggestions = generateOfflineSuggestions("", baseContext);
    expect(suggestions.length).toBeLessThanOrEqual(6);
  });
});

describe("generateScoutSuggestions", () => {
  it("returns the provider result when it is valid", async () => {
    const provider: ScoutProvider = {
      generate: vi.fn().mockResolvedValue([
        { title: "From LLM", category: "food", estimatedCost: 10 },
      ]),
    };
    const result = await generateScoutSuggestions("food", baseContext, provider);
    expect(result.suggestions[0].title).toBe("From LLM");
    expect(result.suggestions[0].estimatedCostMinor).toBe(1_000n);
  });

  it("falls back offline when the provider throws", async () => {
    const provider: ScoutProvider = {
      generate: vi.fn().mockRejectedValue(new Error("boom")),
    };
    const result = await generateScoutSuggestions("food", baseContext, provider);
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.suggestions[0].title).not.toBe("From LLM");
  });

  it("falls back offline when the provider returns an empty array", async () => {
    const provider: ScoutProvider = { generate: vi.fn().mockResolvedValue([]) };
    const result = await generateScoutSuggestions("food", baseContext, provider);
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  it("falls back offline when no provider is given", async () => {
    const result = await generateScoutSuggestions("culture", baseContext);
    expect(result.suggestions.length).toBeGreaterThan(0);
  });
});

describe("createHttpScoutProvider", () => {
  it("parses a { suggestions } response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ suggestions: [{ title: "A" }, { title: "B" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = createHttpScoutProvider({ endpoint: "https://example.test/scout" });
    const raw = await provider.generate("food", baseContext);
    expect(raw).toEqual([{ title: "A" }, { title: "B" }]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://example.test/scout");
    expect((init as RequestInit).body).toContain("food");
    vi.unstubAllGlobals();
  });

  it("sends a bearer header when an apiKey is set", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);

    const provider = createHttpScoutProvider({ endpoint: "https://example.test/scout", apiKey: "secret" });
    await provider.generate("food", baseContext);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret");
    vi.unstubAllGlobals();
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const provider = createHttpScoutProvider({ endpoint: "https://example.test/scout" });
    await expect(provider.generate("food", baseContext)).rejects.toThrow(AiScoutValidationError);
    vi.unstubAllGlobals();
  });

  it("throws on an unexpected response shape", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ nope: 1 }) }));
    const provider = createHttpScoutProvider({ endpoint: "https://example.test/scout" });
    await expect(provider.generate("food", baseContext)).rejects.toThrow(AiScoutValidationError);
    vi.unstubAllGlobals();
  });
});
