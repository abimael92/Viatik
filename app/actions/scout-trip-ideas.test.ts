import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: {
    GEMINI_API_KEY: "test-gemini-key" as string | undefined,
    OPENAI_API_KEY: "test-openai-key" as string | undefined,
  },
  getUser: vi.fn(),
}));

vi.mock("@/env.mjs", () => ({ env: mocks.env }));
vi.mock("@/lib/supabase/server-client", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));

import { generateScoutTripIdeas } from "@/app/actions/scout-trip-ideas";

const suggestion = {
  destination: "Kyoto, Japan",
  ideal_duration_days: 7,
  best_season: "Fall (Oct-Nov) for mild weather and colorful leaves.",
  estimated_flight_cost_per_person: 900,
  estimated_daily_budget_per_person: 180,
  estimated_hotel_per_night: 200,
  estimated_alt_stay_per_night: 150,
  scout_pitch:
    "Wander quiet temple paths, then find a tiny noodle shop. It sounds like your kind of reset.",
};

const input = {
  vibe: "Nature and slow mornings",
  crewSize: 2,
  savingsCapacityMinor: "25000",
  savingsCadence: "monthly",
  currency: "USD",
  consentToAI: true,
};

function fiveIdeas() {
  return [
    suggestion,
    { ...suggestion, destination: "Porto, Portugal" },
    { ...suggestion, destination: "Reykjavik, Iceland" },
    { ...suggestion, destination: "Oaxaca, Mexico" },
    { ...suggestion, destination: "Montreal, Canada" },
  ];
}

function geminiPayload(ideas: unknown[]) {
  return {
    ok: true,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ ideas }) }] } }],
    }),
  } as Response;
}

function openAiPayload(ideas: unknown[]) {
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify({ ideas }) } }],
    }),
  } as Response;
}

describe("generateScoutTripIdeas", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.env.GEMINI_API_KEY = "test-gemini-key";
    mocks.env.OPENAI_API_KEY = "test-openai-key";
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  });

  it("requires a signed-in user before making an AI request", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(generateScoutTripIdeas(input)).resolves.toEqual({
      success: false,
      error: "Sign in again to ask Scout.",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses Gemini as primary provider and asks for a ranked ideas array", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(geminiPayload(fiveIdeas()));

    const result = await generateScoutTripIdeas(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.suggestions.ideas).toHaveLength(5);
      expect(result.suggestions.ideas[0]!.destination).toBe("Kyoto, Japan");
    }

    const [url, request] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toContain("generativelanguage.googleapis.com/v1beta/models/");
    expect(new Headers(request?.headers).get("x-goog-api-key")).toBe("test-gemini-key");
    const body = JSON.parse(String(request?.body));
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseSchema.properties.ideas.type).toBe("ARRAY");
    expect(
      body.generationConfig.responseSchema.properties.ideas.items.properties
        .estimated_hotel_per_night.type
    ).toBe("INTEGER");
    expect(JSON.stringify(body.contents)).toContain("250.00 USD monthly");
    const promptPayload = JSON.parse(body.contents[0].parts[0].text);
    expect(promptPayload.language).toBe("English");
    expect(promptPayload.requirements).toContain("exactly 5 distinct");
  });

  it("requests the Spanish language and the exact count when asked", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(geminiPayload(fiveIdeas()));

    await generateScoutTripIdeas({
      ...input,
      locale: "es",
      count: 2,
      excludeDestinations: ["Kyoto, Japan"],
    });

    const body = JSON.parse(String(fetchSpy.mock.calls[0]![1]?.body));
    const promptPayload = JSON.parse(body.contents[0].parts[0].text);
    expect(promptPayload.language).toBe("Spanish");
    expect(promptPayload.requirements).toContain("exactly 2 distinct");
    expect(promptPayload.excludeDestinations).toEqual(["Kyoto, Japan"]);
  });

  it("falls back to OpenAI strict JSON Schema when Gemini is unconfigured", async () => {
    mocks.env.GEMINI_API_KEY = undefined;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(openAiPayload(fiveIdeas()));

    const result = await generateScoutTripIdeas(input);
    expect(result.success).toBe(true);
    if (result.success) expect(result.suggestions.ideas).toHaveLength(5);

    const [url, request] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe("https://api.openai.com/v1/chat/completions");
    const body = JSON.parse(String(request?.body));
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.response_format.json_schema.schema.properties.ideas.type).toBe("array");
    expect(body.messages[1].content).toContain("250.00 USD monthly");
  });

  it("falls back to OpenAI when Gemini fails and both keys are configured", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({ ok: false, status: 503 } as Response)
      .mockResolvedValueOnce(openAiPayload(fiveIdeas()));

    const result = await generateScoutTripIdeas(input);
    expect(result.success).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain("generativelanguage.googleapis.com");
    expect(String(fetchSpy.mock.calls[1]![0])).toBe("https://api.openai.com/v1/chat/completions");
  });

  it("returns five ranked, vibe-first ideas when no provider is configured", async () => {
    mocks.env.GEMINI_API_KEY = undefined;
    mocks.env.OPENAI_API_KEY = undefined;
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await generateScoutTripIdeas(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const ideas = result.suggestions.ideas;
      expect(ideas).toHaveLength(5);
      expect(new Set(ideas.map((idea) => idea.destination.toLowerCase())).size).toBe(5);
      expect(ideas[0]!.destination).toBe("Banff, Canada");
      expect(ideas.map((idea) => idea.destination)).toEqual([
        "Banff, Canada",
        "San Jose, Costa Rica",
        "Interlaken, Switzerland",
        "Reykjavik, Iceland",
        "Queenstown, New Zealand",
      ]);
      expect(ideas[0]!.estimated_hotel_per_night).toBeGreaterThanOrEqual(
        ideas[0]!.estimated_alt_stay_per_night
      );
      for (const idea of ideas) {
        expect(idea.best_season).toContain("·");
        expect(idea.scout_pitch.split(/(?<=[.!?])\s+/)).toHaveLength(2);
      }
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("adds two more destinations that exclude every destination already shown", async () => {
    mocks.env.GEMINI_API_KEY = undefined;
    mocks.env.OPENAI_API_KEY = undefined;

    const first = await generateScoutTripIdeas(input);
    expect(first.success).toBe(true);
    if (!first.success) return;

    const shown = first.suggestions.ideas.map((idea) => idea.destination);
    const more = await generateScoutTripIdeas({
      ...input,
      count: 2,
      excludeDestinations: shown,
    });

    expect(more.success).toBe(true);
    if (!more.success) return;
    expect(more.suggestions.ideas).toHaveLength(2);
    for (const idea of more.suggestions.ideas) {
      expect(shown).not.toContain(idea.destination);
    }
  });

  it("localizes fallback season and pitch text for Spanish", async () => {
    mocks.env.GEMINI_API_KEY = undefined;
    mocks.env.OPENAI_API_KEY = undefined;

    const result = await generateScoutTripIdeas({ ...input, locale: "es" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.suggestions.ideas[0]!.best_season).toContain("clima templado");
      expect(result.suggestions.ideas[0]!.scout_pitch).toContain("mantiene el viaje corto");
    }
  });

  it("drops duplicate destinations from provider output", async () => {
    mocks.env.GEMINI_API_KEY = undefined;
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      openAiPayload([suggestion, suggestion, { ...suggestion, destination: "Reykjavik, Iceland" }])
    );

    const result = await generateScoutTripIdeas(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const destinations = result.suggestions.ideas.map((idea) => idea.destination.toLowerCase());
      expect(new Set(destinations).size).toBe(destinations.length);
    }
  });

  it("falls back to deterministic ideas when provider content is malformed", async () => {
    mocks.env.GEMINI_API_KEY = undefined;
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "Here are some ideas!" } }] }),
    } as Response);

    const result = await generateScoutTripIdeas(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.suggestions.ideas).toHaveLength(5);
      expect(result.suggestions.ideas[0]!.destination).toBe("Banff, Canada");
    }
  });

  it("passes origin, timing, and fine-tune inputs into the provider prompt", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(geminiPayload(fiveIdeas()));

    await generateScoutTripIdeas({
      ...input,
      originCity: "Guadalajara, Mexico",
      timing: "month",
      targetMonth: "2027-12",
      tripLength: "week",
      durationDays: 5,
      comfort: "premium",
      stayStyle: "rental",
      nonstopOnly: true,
      constraints: "Vegetarian, no long hikes",
    });

    const body = JSON.parse(String(fetchSpy.mock.calls[0]![1]?.body));
    const payload = JSON.parse(body.contents[0].parts[0].text);
    expect(payload.departureCity).toBe("Guadalajara, Mexico");
    expect(payload.timing).toBe("month");
    expect(payload.targetMonth).toBe("2027-12");
    expect(payload.tripLength).toBe("week");
    expect(payload.exactDurationDays).toBe(5);
    expect(payload.comfort).toBe("premium");
    expect(payload.stayStyle).toBe("rental");
    expect(payload.nonstopOnly).toBe(true);
    expect(payload.constraints).toBe("Vegetarian, no long hikes");
    expect(payload.requirements).toContain("must be exactly 5");
  });

  it("omits the savings pace from the prompt when the traveler has not set one", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(geminiPayload(fiveIdeas()));

    const result = await generateScoutTripIdeas({ ...input, savingsCapacityMinor: "0" });
    expect(result.success).toBe(true);

    const body = JSON.parse(String(fetchSpy.mock.calls[0]![1]?.body));
    const payload = JSON.parse(body.contents[0].parts[0].text);
    expect(payload.savingsCapacity).toBeNull();
    expect(payload.savingsHorizonsPerTraveler).toBeNull();
    expect(payload.requirements).toContain("has not set a savings pace");
  });

  it("honors an exact day count over the trip-length preset in the fallback", async () => {
    mocks.env.GEMINI_API_KEY = undefined;
    mocks.env.OPENAI_API_KEY = undefined;

    const result = await generateScoutTripIdeas({
      ...input,
      tripLength: "two-weeks",
      durationDays: 3,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      for (const idea of result.suggestions.ideas) {
        expect(idea.ideal_duration_days).toBe(3);
      }
    }
  });

  it("bends fallback durations to the requested trip length", async () => {
    mocks.env.GEMINI_API_KEY = undefined;
    mocks.env.OPENAI_API_KEY = undefined;

    const weekend = await generateScoutTripIdeas({ ...input, tripLength: "weekend" });
    expect(weekend.success).toBe(true);
    if (weekend.success) {
      for (const idea of weekend.suggestions.ideas) {
        expect(idea.ideal_duration_days).toBeLessThanOrEqual(4);
      }
    }

    const twoWeeks = await generateScoutTripIdeas({ ...input, tripLength: "two-weeks" });
    expect(twoWeeks.success).toBe(true);
    if (twoWeeks.success) {
      for (const idea of twoWeeks.suggestions.ideas) {
        expect(idea.ideal_duration_days).toBeGreaterThanOrEqual(10);
      }
    }
  });

  it("shifts fallback stay and daily costs by the comfort level", async () => {
    mocks.env.GEMINI_API_KEY = undefined;
    mocks.env.OPENAI_API_KEY = undefined;

    const budget = await generateScoutTripIdeas({ ...input, comfort: "budget" });
    const premium = await generateScoutTripIdeas({ ...input, comfort: "premium" });
    expect(budget.success).toBe(true);
    expect(premium.success).toBe(true);
    if (!budget.success || !premium.success) return;

    const budgetIdea = budget.suggestions.ideas[0]!;
    const premiumIdea = premium.suggestions.ideas[0]!;
    expect(premiumIdea.destination).toBe(budgetIdea.destination);
    expect(premiumIdea.estimated_hotel_per_night).toBeGreaterThan(
      budgetIdea.estimated_hotel_per_night
    );
    expect(premiumIdea.estimated_daily_budget_per_person).toBeGreaterThan(
      budgetIdea.estimated_daily_budget_per_person
    );
  });

  it("uses the rental rate as the goal when the traveler prefers rentals", async () => {
    mocks.env.GEMINI_API_KEY = undefined;
    mocks.env.OPENAI_API_KEY = undefined;

    const either = await generateScoutTripIdeas({ ...input, stayStyle: "either" });
    const rental = await generateScoutTripIdeas({ ...input, stayStyle: "rental" });
    expect(either.success).toBe(true);
    expect(rental.success).toBe(true);
    if (!either.success || !rental.success) return;

    const eitherIdea = either.suggestions.ideas[0]!;
    const rentalIdea = rental.suggestions.ideas[0]!;
    expect(rentalIdea.destination).toBe(eitherIdea.destination);
    expect(rentalIdea.estimated_hotel_per_night).toBe(
      eitherIdea.estimated_alt_stay_per_night
    );
  });

  it("rejects unconsented or oversized input before calling the provider", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(
      generateScoutTripIdeas({ ...input, consentToAI: false, savingsCapacityMinor: "99999999999" })
    ).resolves.toMatchObject({ success: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
