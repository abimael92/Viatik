import { describe, expect, it } from "vitest";

import {
  scoutTripIdeaSchema,
  scoutTripIdeasJsonSchema,
  scoutTripIdeasInputSchema,
  scoutTripIdeasResponseSchema,
} from "@/features/trip-planner/domain/scout-trip-ideas-schema";

const suggestion = {
  destination: "Kyoto, Japan",
  ideal_duration_days: 7,
  best_season: "Fall (Oct-Nov) for mild weather and colorful leaves.",
  estimated_flight_cost_per_person: 900,
  estimated_daily_budget_per_person: 180,
  scout_pitch:
    "This mix of quiet gardens and delicious food sounds right up your alley. You will love the slower pace.",
};

describe("Scout trip idea contracts", () => {
  it("requires explicit consent and bounded, supported user answers", () => {
    expect(
      scoutTripIdeasInputSchema.safeParse({
        vibe: "Nature and slow mornings",
        crewSize: 2,
        savingsCapacityMinor: "25000",
        savingsCadence: "monthly",
        currency: "USD",
      }).success
    ).toBe(false);

    expect(
      scoutTripIdeasInputSchema.safeParse({
        vibe: "Nature and slow mornings",
        crewSize: 2,
        savingsCapacityMinor: "25000",
        savingsCadence: "monthly",
        currency: "USD",
        consentToAI: true,
      }).success
    ).toBe(true);
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
      scoutTripIdeasResponseSchema.safeParse({
        idea_one: suggestion,
        idea_two: suggestion,
        idea_three: { ...suggestion, unexpected: "field" },
      }).success
    ).toBe(false);
  });

  it("requires three output slots in the strict JSON contract", () => {
    expect(
      scoutTripIdeasResponseSchema.safeParse({
        idea_one: suggestion,
        idea_two: suggestion,
      }).success
    ).toBe(false);

    expect(
      scoutTripIdeasResponseSchema.safeParse({
        idea_one: suggestion,
        idea_two: suggestion,
        idea_three: { ...suggestion, destination: "Reykjavik, Iceland" },
      }).success
    ).toBe(true);
  });

  it("generates OpenAI's strict JSON Schema from the Zod contract", () => {
    const schema = scoutTripIdeasJsonSchema as {
      properties: Record<string, { properties: Record<string, { type: string }> }>;
      additionalProperties: boolean;
      $schema?: string;
    };
    expect(schema.$schema).toBeUndefined();
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.idea_one.properties.estimated_flight_cost_per_person.type).toBe(
      "integer"
    );
    expect(schema.properties.idea_one.properties.estimated_daily_budget_per_person.type).toBe(
      "integer"
    );
  });
});
