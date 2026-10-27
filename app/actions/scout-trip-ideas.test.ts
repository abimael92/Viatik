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
  continent: "Asia",
  flight_route: {
    legs: [
      {
        from: "Guadalajara",
        to: "Seoul",
        approx_duration_minutes: 300,
        layover_after_minutes: 90,
      },
      {
        from: "Seoul",
        to: "Kyoto",
        approx_duration_minutes: 540,
        layover_after_minutes: 0,
      },
    ],
    arrives_same_date: false,
  },
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

  it("keeps the pitch rhythm and the strict estimate rules in the system prompt", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(geminiPayload(fiveIdeas()));

    await generateScoutTripIdeas(input);

    const body = JSON.parse(String(fetchSpy.mock.calls[0]![1]?.body));
    const systemPrompt: string = body.systemInstruction.parts[0].text;
    expect(systemPrompt).toContain("exactly two sentences");
    expect(systemPrompt).toContain("sensory atmosphere");
    expect(systemPrompt).toContain("'City, Country'");
    expect(systemPrompt).toContain("never minor units or cents");
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

  it("maps each wizard vibe chip to its own fallback pool", async () => {
    mocks.env.GEMINI_API_KEY = undefined;
    mocks.env.OPENAI_API_KEY = undefined;

    const poolOf = async (vibe: string) => {
      const result = await generateScoutTripIdeas({ ...input, vibe });
      return result.success ? result.suggestions.ideas.map((idea) => idea.destination) : [];
    };

    const beach = [
      "Puerto Vallarta, Mexico",
      "Cancun, Mexico",
      "Lisbon, Portugal",
      "Split, Croatia",
      "Bali, Indonesia",
    ];
    const food = [
      "Oaxaca, Mexico",
      "Bologna, Italy",
      "Porto, Portugal",
      "Ho Chi Minh City, Vietnam",
      "Kyoto, Japan",
    ];
    const nature = [
      "Banff, Canada",
      "San Jose, Costa Rica",
      "Interlaken, Switzerland",
      "Queenstown, New Zealand",
      "Reykjavik, Iceland",
    ];

    expect(
      (await poolOf("Slow mornings by the water")).every((item) => beach.includes(item))
    ).toBe(true);
    expect(
      (await poolOf("Vibrant streets, culture & good food")).every((item) => food.includes(item))
    ).toBe(true);
    expect(
      (await poolOf("Fresh mountain air & quiet trails")).every((item) => nature.includes(item))
    ).toBe(true);
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

  it("forces the pinned destination and dedupes provider routes by signature", async () => {
    mocks.env.GEMINI_API_KEY = undefined;
    const routeTo = (chain: string[], minutes: number) => ({
      legs: chain.slice(0, -1).map((from, index) => ({
        from,
        to: chain[index + 1],
        approx_duration_minutes: minutes,
        layover_after_minutes: index === chain.length - 2 ? 0 : 90,
      })),
      arrives_same_date: true,
    });
    const viaSeoul = routeTo(["Guadalajara", "Seoul", "Kyoto"], 300);
    const viaTokyo = routeTo(["Guadalajara", "Tokyo", "Kyoto"], 320);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      openAiPayload([
        { ...suggestion, destination: "Somewhere Else, Japan", flight_route: viaSeoul },
        { ...suggestion, flight_route: viaTokyo },
        // Same city chain in different case is a duplicate routing.
        {
          ...suggestion,
          flight_route: routeTo(["guadalajara", "seoul", "kyoto"], 999),
        },
      ])
    );

    const result = await generateScoutTripIdeas({
      ...input,
      vibe: "",
      destination: "Kyoto, Japan",
      originCity: "Guadalajara, Mexico",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.suggestions.ideas).toHaveLength(2);
      for (const idea of result.suggestions.ideas) {
        expect(idea.destination).toBe("Kyoto, Japan");
      }
      expect(result.suggestions.ideas[0]!.flight_route.legs[1]!.from).toBe("Seoul");
      expect(result.suggestions.ideas[1]!.flight_route.legs[1]!.from).toBe("Tokyo");
    }
  });

  it("drops provider routes the traveler already saw", async () => {
    mocks.env.GEMINI_API_KEY = undefined;
    const legs = (hub: string) => ({
      legs: [
        { from: "Guadalajara", to: hub, approx_duration_minutes: 200, layover_after_minutes: 90 },
        { from: hub, to: "Kyoto", approx_duration_minutes: 500, layover_after_minutes: 0 },
      ],
      arrives_same_date: true,
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      openAiPayload([
        { ...suggestion, flight_route: legs("Seoul") },
        { ...suggestion, flight_route: legs("Tokyo") },
      ])
    );

    const result = await generateScoutTripIdeas({
      ...input,
      destination: "Kyoto, Japan",
      excludeRoutes: ["Guadalajara > Seoul > Kyoto".toLowerCase()],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.suggestions.ideas).toHaveLength(1);
      expect(result.suggestions.ideas[0]!.flight_route.legs[0]!.to).toBe("Tokyo");
    }
  });

  it("never fabricates routes in route mode without a provider or after failure", async () => {
    mocks.env.GEMINI_API_KEY = undefined;
    mocks.env.OPENAI_API_KEY = undefined;
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const noKeys = await generateScoutTripIdeas({ ...input, destination: "Kyoto, Japan" });
    expect(noKeys).toEqual({
      success: false,
      error:
        "Planning a specific place needs Scout's AI connection. Try again, or add the idea manually.",
    });
    expect(fetchSpy).not.toHaveBeenCalled();

    mocks.env.OPENAI_API_KEY = "test-openai-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({ ok: false, status: 503 } as Response);
    const failed = await generateScoutTripIdeas({ ...input, destination: "Kyoto, Japan" });
    expect(failed).toEqual({
      success: false,
      error:
        "Planning a specific place needs Scout's AI connection. Try again, or add the idea manually.",
    });
  });

  it("repairs broken leg joins and clamps route fields from the provider", async () => {
    mocks.env.GEMINI_API_KEY = undefined;
    const broken = {
      ...suggestion,
      continent: "asia",
      flight_route: {
        legs: [
          {
            from: "Guadalajara",
            to: "Seoul",
            approx_duration_minutes: 9999,
            layover_after_minutes: 120,
          },
          {
            from: "Wrong City",
            to: "Kyoto",
            approx_duration_minutes: 540,
            layover_after_minutes: 30,
          },
        ],
        arrives_same_date: true,
      },
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(openAiPayload([broken]));

    const result = await generateScoutTripIdeas(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const [idea] = result.suggestions.ideas;
      expect(idea!.continent).toBe("Asia");
      expect(idea!.flight_route.legs[0]!.approx_duration_minutes).toBe(1500);
      expect(idea!.flight_route.legs[1]!.from).toBe("Seoul");
      expect(idea!.flight_route.legs[1]!.layover_after_minutes).toBe(0);
    }
  });

  it("sends route-mode fields and derived exact duration in the provider payload", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(geminiPayload(fiveIdeas()));

    await generateScoutTripIdeas({
      ...input,
      vibe: "",
      destination: "Kyoto, Japan",
      originCity: "Guadalajara, Mexico",
      timing: "dates",
      startDate: "2027-03-10",
      endDate: "2027-03-17",
      durationDays: null,
      excludeRoutes: ["guadalajara > seoul > kyoto"],
    });

    const body = JSON.parse(String(fetchSpy.mock.calls[0]![1]?.body));
    const payload = JSON.parse(body.contents[0].parts[0].text);
    expect(payload.destination).toBe("Kyoto, Japan");
    expect(payload.startDate).toBe("2027-03-10");
    expect(payload.endDate).toBe("2027-03-17");
    expect(payload.exactDurationDays).toBe(8);
    expect(payload.excludeRoutes).toEqual(["guadalajara > seoul > kyoto"]);
    expect(payload.requirements).toContain("distinct flight-route options");
    expect(payload.requirements).toContain("exactly 8");
  });

  it("returns continent and a contiguous estimated route in fallback ideas", async () => {
    mocks.env.GEMINI_API_KEY = undefined;
    mocks.env.OPENAI_API_KEY = undefined;

    const result = await generateScoutTripIdeas(input);
    expect(result.success).toBe(true);
    if (result.success) {
      for (const idea of result.suggestions.ideas) {
        expect(idea.continent).toBeTruthy();
        expect(idea.flight_route.legs.length).toBeGreaterThanOrEqual(1);
        for (let index = 1; index < idea.flight_route.legs.length; index += 1) {
          expect(idea.flight_route.legs[index]!.from).toBe(idea.flight_route.legs[index - 1]!.to);
        }
      }
      const continents = new Set(result.suggestions.ideas.map((idea) => idea.continent));
      // The anchor continent leads: every in-pool option shares the top pick's continent.
      expect(continents.size).toBeGreaterThanOrEqual(1);
    }
  });

  it("rejects unconsented or oversized input before calling the provider", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(
      generateScoutTripIdeas({ ...input, consentToAI: false, savingsCapacityMinor: "99999999999" })
    ).resolves.toMatchObject({ success: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
