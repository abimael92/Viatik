import { describe, expect, it } from "vitest";

import {
  SCOUT_INITIAL_IDEA_COUNT,
  SCOUT_MORE_IDEA_COUNT,
  scoutTripIdeaSchema,
  scoutTripIdeasInputSchema,
  scoutTripIdeasJsonSchema,
  scoutTripIdeasResponseSchema,
} from "@/features/trip-planner/domain/scout-trip-ideas-schema";

const suggestion = {
  destination: "Kyoto, Japan",
  ideal_duration_days: 7,
  best_season: "Fall (Oct-Nov) for mild weather and colorful leaves.",
  estimated_flight_cost_per_person: 900,
  estimated_daily_budget_per_person: 180,
  estimated_hotel_per_night: 200,
  estimated_alt_stay_per_night: 150,
  scout_pitch:
    "This mix of quiet gardens and delicious food sounds right up your alley. You will love the slower pace.",
};

const baseInput = {
  vibe: "Nature and slow mornings",
  crewSize: 2,
  savingsCapacityMinor: "25000",
  savingsCadence: "monthly",
  currency: "USD",
  consentToAI: true,
};

describe("Scout trip idea contracts", () => {
  it("requires explicit consent and bounded, supported user answers", () => {
    const withoutConsent = {
      vibe: "Nature and slow mornings",
      crewSize: 2,
      savingsCapacityMinor: "25000",
      savingsCadence: "monthly",
      currency: "USD",
    };
    expect(scoutTripIdeasInputSchema.safeParse(withoutConsent).success).toBe(false);
    expect(scoutTripIdeasInputSchema.safeParse({ ...withoutConsent, consentToAI: true }).success).toBe(
      true
    );
  });

  it("defaults to five ideas, no exclusions, and English", () => {
    const parsed = scoutTripIdeasInputSchema.parse({ ...baseInput, consentToAI: true });
    expect(parsed.count).toBe(SCOUT_INITIAL_IDEA_COUNT);
    expect(SCOUT_INITIAL_IDEA_COUNT).toBe(5);
    expect(SCOUT_MORE_IDEA_COUNT).toBe(2);
    expect(parsed.excludeDestinations).toEqual([]);
    expect(parsed.locale).toBe("en");
  });

  it("defaults the planning inputs so older callers keep working", () => {
    const parsed = scoutTripIdeasInputSchema.parse({ ...baseInput, consentToAI: true });
    expect(parsed.originCity).toBe("");
    expect(parsed.timing).toBe("asap");
    expect(parsed.targetMonth).toBeNull();
    expect(parsed.tripLength).toBe("any");
    expect(parsed.comfort).toBe("balanced");
    expect(parsed.stayStyle).toBe("either");
    expect(parsed.nonstopOnly).toBe(false);
    expect(parsed.constraints).toBe("");
  });

  it("rejects malformed planning inputs", () => {
    expect(
      scoutTripIdeasInputSchema.safeParse({ ...baseInput, consentToAI: true, targetMonth: "2027-13" })
        .success
    ).toBe(false);
    expect(
      scoutTripIdeasInputSchema.safeParse({ ...baseInput, consentToAI: true, tripLength: "month" })
        .success
    ).toBe(false);
    expect(
      scoutTripIdeasInputSchema.safeParse({ ...baseInput, consentToAI: true, comfort: "luxury" })
        .success
    ).toBe(false);
    expect(
      scoutTripIdeasInputSchema.safeParse({ ...baseInput, consentToAI: true, stayStyle: "camping" })
        .success
    ).toBe(false);
    expect(
      scoutTripIdeasInputSchema.safeParse({ ...baseInput, consentToAI: true, constraints: "x".repeat(201) })
        .success
    ).toBe(false);
  });

  it("accepts a Spanish locale, a two-idea request, and an exclusion list", () => {
    const parsed = scoutTripIdeasInputSchema.safeParse({
      ...baseInput,
      consentToAI: true,
      locale: "es",
      count: SCOUT_MORE_IDEA_COUNT,
      excludeDestinations: ["Kyoto, Japan", "Porto, Portugal"],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects counts outside the supported range", () => {
    expect(
      scoutTripIdeasInputSchema.safeParse({ ...baseInput, consentToAI: true, count: 8 }).success
    ).toBe(false);
    expect(
      scoutTripIdeasInputSchema.safeParse({ ...baseInput, consentToAI: true, count: 0 }).success
    ).toBe(false);
  });

  it("rejects malformed, non-integer, and non-positive estimates", () => {
    expect(
      scoutTripIdeaSchema.safeParse({
        ...suggestion,
        estimated_flight_cost_per_person: 900.5,
      }).success
    ).toBe(false);
    expect(
      scoutTripIdeaSchema.safeParse({
        ...suggestion,
        scout_pitch: "One sentence is not enough for a Scout pitch.",
      }).success
    ).toBe(false);
    expect(
      scoutTripIdeaSchema.safeParse({
        ...suggestion,
        estimated_daily_budget_per_person: 0,
      }).success
    ).toBe(false);
    expect(scoutTripIdeaSchema.safeParse({ ...suggestion, destination: "Kyoto" }).success).toBe(
      false
    );
    expect(
      scoutTripIdeaSchema.safeParse({ ...suggestion, estimated_hotel_per_night: 0 }).success
    ).toBe(false);
    expect(
      scoutTripIdeaSchema.safeParse({ ...suggestion, estimated_alt_stay_per_night: 12.5 }).success
    ).toBe(false);
    expect(
      scoutTripIdeaSchema.safeParse({
        ...suggestion,
        estimated_alt_stay_per_night: undefined,
      }).success
    ).toBe(false);
    expect(
      scoutTripIdeasResponseSchema.safeParse({
        ideas: [suggestion, { ...suggestion, unexpected: "field" }],
      }).success
    ).toBe(false);
  });

  it("requires a non-empty ideas array and caps the total", () => {
    expect(scoutTripIdeasResponseSchema.safeParse({ ideas: [] }).success).toBe(false);
    expect(scoutTripIdeasResponseSchema.safeParse({ idea_one: suggestion }).success).toBe(false);

    const five = Array.from({ length: 5 }, (_, index) => ({
      ...suggestion,
      destination: `City ${index}, Country`,
    }));
    expect(scoutTripIdeasResponseSchema.safeParse({ ideas: five }).success).toBe(true);
    expect(
      scoutTripIdeasResponseSchema.safeParse({
        ideas: [...five, ...five, ...five],
      }).success
    ).toBe(false);
  });

  it("generates OpenAI's strict JSON Schema for an ideas array", () => {
    const schema = scoutTripIdeasJsonSchema as unknown as {
      properties: {
        ideas: {
          type: string;
          items: { properties: Record<string, { type: string }>; additionalProperties: boolean };
        };
      };
      additionalProperties: boolean;
      $schema?: string;
    };
    expect(schema.$schema).toBeUndefined();
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.ideas.type).toBe("array");
    expect(schema.properties.ideas.items.additionalProperties).toBe(false);
    expect(
      schema.properties.ideas.items.properties.estimated_flight_cost_per_person.type
    ).toBe("integer");
    expect(schema.properties.ideas.items.properties.estimated_hotel_per_night.type).toBe("integer");
    expect(schema.properties.ideas.items.properties.estimated_alt_stay_per_night.type).toBe(
      "integer"
    );
  });
});
