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
  continent: "Asia",
  flight_route: {
    legs: [
      {
        from: "Guadalajara",
        to: "Kyoto",
        approx_duration_minutes: 780,
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
    expect(parsed.durationDays).toBeNull();
    expect(parsed.comfort).toBe("balanced");
    expect(parsed.stayStyle).toBe("either");
    expect(parsed.nonstopOnly).toBe(false);
    expect(parsed.constraints).toBe("");
  });

  it("accepts an exact trip length between 1 and 60 days", () => {
    expect(
      scoutTripIdeasInputSchema.safeParse({ ...baseInput, consentToAI: true, durationDays: 1 })
        .success
    ).toBe(true);
    expect(
      scoutTripIdeasInputSchema.safeParse({ ...baseInput, consentToAI: true, durationDays: 60 })
        .success
    ).toBe(true);
    for (const durationDays of [0, 61, 2.5]) {
      expect(
        scoutTripIdeasInputSchema.safeParse({ ...baseInput, consentToAI: true, durationDays })
          .success
      ).toBe(false);
    }
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

  it("requires a comma-formatted destination and lets it relax the vibe minimum", () => {
    expect(
      scoutTripIdeasInputSchema.safeParse({ ...baseInput, consentToAI: true, destination: "Kyoto" })
        .success
    ).toBe(false);
    expect(
      scoutTripIdeasInputSchema.safeParse({
        ...baseInput,
        consentToAI: true,
        destination: "Kyoto, Japan",
        vibe: "",
      }).success
    ).toBe(true);
    expect(
      scoutTripIdeasInputSchema.safeParse({ ...baseInput, consentToAI: true, vibe: "x" }).success
    ).toBe(false);
  });

  it("bounds the route exclusion list like the destination one", () => {
    const parsed = scoutTripIdeasInputSchema.parse({
      ...baseInput,
      consentToAI: true,
      destination: "Kyoto, Japan",
      excludeRoutes: ["gdl > icn > kix", "gdl > nrt > kix"],
    });
    expect(parsed.excludeRoutes).toEqual(["gdl > icn > kix", "gdl > nrt > kix"]);
    expect(
      scoutTripIdeasInputSchema.safeParse({
        ...baseInput,
        consentToAI: true,
        excludeRoutes: Array.from({ length: 21 }, () => "a > b"),
      }).success
    ).toBe(false);
  });

  it("requires ordered, bounded exact dates only for the dates timing", () => {
    const exact = {
      ...baseInput,
      consentToAI: true,
      timing: "dates",
      startDate: "2027-03-10",
      endDate: "2027-03-17",
    };
    expect(scoutTripIdeasInputSchema.safeParse(exact).success).toBe(true);
    expect(scoutTripIdeasInputSchema.safeParse({ ...exact, endDate: "2027-03-09" }).success).toBe(
      false
    );
    expect(scoutTripIdeasInputSchema.safeParse({ ...exact, startDate: null }).success).toBe(false);
    expect(scoutTripIdeasInputSchema.safeParse({ ...exact, endDate: "2027-05-10" }).success).toBe(
      false
    );
    expect(
      scoutTripIdeasInputSchema.safeParse({ ...baseInput, consentToAI: true, timing: "asap" })
        .success
    ).toBe(true);
    expect(scoutTripIdeasInputSchema.safeParse({ ...exact, startDate: "2027-3-1" }).success).toBe(
      false
    );
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

  it("requires a known continent and a contiguous flight route", () => {
    expect(scoutTripIdeaSchema.safeParse({ ...suggestion, continent: "Antarctica" }).success).toBe(
      false
    );
    expect(scoutTripIdeaSchema.safeParse({ ...suggestion, continent: undefined }).success).toBe(
      false
    );

    const broken = {
      ...suggestion,
      flight_route: {
        legs: [
          { from: "A", to: "B", approx_duration_minutes: 120, layover_after_minutes: 60 },
          { from: "X", to: "C", approx_duration_minutes: 120, layover_after_minutes: 0 },
        ],
        arrives_same_date: true,
      },
    };
    expect(scoutTripIdeaSchema.safeParse(broken).success).toBe(false);
    expect(
      scoutTripIdeaSchema.safeParse({ ...suggestion, flight_route: { legs: [] } }).success
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
