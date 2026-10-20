import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiKey: "test-openai-key",
  getUser: vi.fn(),
}));

vi.mock("@/env.mjs", () => ({ env: { OPENAI_API_KEY: mocks.apiKey } }));
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

describe("generateScoutTripIdeas", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  });

  it("requires a signed-in user before making a structured OpenAI request", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(generateScoutTripIdeas(input)).resolves.toEqual({
      success: false,
      error: "Sign in again to ask Scout.",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("validates and returns the three strict JSON suggestions", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                idea_one: suggestion,
                idea_two: { ...suggestion, destination: "Porto, Portugal" },
                idea_three: { ...suggestion, destination: "Reykjavik, Iceland" },
              }),
            },
          },
        ],
      }),
    } as Response);

    const result = await generateScoutTripIdeas(input);
    expect(result.success).toBe(true);
    if (result.success) expect(Object.keys(result.suggestions)).toHaveLength(3);

    const [, request] = fetchSpy.mock.calls[0]!;
    const body = JSON.parse(String(request?.body));
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(
      body.response_format.json_schema.schema.properties.idea_one.properties
        .estimated_flight_cost_per_person.type
    ).toBe("integer");
    expect(body.messages[1].content).toContain("250.00 USD monthly");
  });

  it("rejects malformed provider content and duplicate destinations", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "Here are some ideas!" } }] }),
    } as Response);
    await expect(generateScoutTripIdeas(input)).resolves.toMatchObject({ success: false });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                idea_one: suggestion,
                idea_two: suggestion,
                idea_three: { ...suggestion, destination: "Reykjavik, Iceland" },
              }),
            },
          },
        ],
      }),
    } as Response);
    await expect(generateScoutTripIdeas(input)).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining("duplicate destinations"),
    });
  });

  it("rejects unconsented or oversized input before calling the provider", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(
      generateScoutTripIdeas({ ...input, consentToAI: false, savingsCapacityMinor: "99999999999" })
    ).resolves.toMatchObject({ success: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
