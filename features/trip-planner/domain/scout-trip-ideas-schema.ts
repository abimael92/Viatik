import { z } from "zod";

export const SCOUT_SUPPORTED_CURRENCIES = ["CAD", "EUR", "GBP", "JPY", "MXN", "USD"] as const;

export const scoutTripIdeasInputSchema = z.object({
  vibe: z.string().trim().min(2).max(240),
  crewSize: z.number().int().min(1).max(20),
  savingsCapacityMinor: z.string().regex(/^\d{1,11}$/),
  savingsCadence: z.enum(["weekly", "monthly"]),
  currency: z.enum(SCOUT_SUPPORTED_CURRENCIES),
  consentToAI: z.literal(true),
});

const scoutPitchSchema = z
  .string()
  .trim()
  .min(20)
  .max(400)
  .describe(
    "A friendly, casual 2-sentence pitch from Scout explaining why this destination perfectly matches their vibe and savings capacity."
  )
  .refine((pitch) => (pitch.match(/[.!?](?:\s|$)/g) ?? []).length === 2, {
    message: "Scout's pitch must have exactly two sentences.",
  });

export const scoutTripIdeaSchema = z
  .object({
    destination: z
      .string()
      .trim()
      .min(3)
      .max(120)
      .describe("The specific suggested destination city and country, e.g., 'Kyoto, Japan'.")
      .refine((destination) => destination.includes(","), "Use a city and country destination."),
    ideal_duration_days: z
      .number()
      .int()
      .min(1)
      .max(60)
      .describe("Ideal number of full days for the trip."),
    best_season: z
      .string()
      .trim()
      .min(3)
      .max(120)
      .describe(
        "Brief advice on the best time to go, e.g., fall (Oct-Nov) for foliage and cool weather."
      ),
    estimated_flight_cost_per_person: z
      .number()
      .int()
      .min(1)
      .max(100_000_000)
      .describe(
        "Estimated total flight cost per person in standard whole currency units (e.g., 500 for $500). Do not output minor units."
      ),
    estimated_daily_budget_per_person: z
      .number()
      .int()
      .min(1)
      .max(100_000_000)
      .describe(
        "Estimated daily cost per person for food, lodging, and activities in standard whole currency units (e.g., 150 for $150). Do not output minor units."
      ),
    scout_pitch: scoutPitchSchema,
  })
  .strict();

export const scoutTripIdeasResponseSchema = z
  .object({
    idea_one: scoutTripIdeaSchema,
    idea_two: scoutTripIdeaSchema,
    idea_three: scoutTripIdeaSchema,
  })
  .strict();

export type ScoutTripIdeasInput = z.infer<typeof scoutTripIdeasInputSchema>;
export type ScoutTripIdeaOutput = z.infer<typeof scoutTripIdeaSchema>;
export type ScoutTripIdeaSuggestion = ScoutTripIdeaOutput;
export type ScoutTripIdeasResponse = z.infer<typeof scoutTripIdeasResponseSchema>;

const generatedJsonSchema = z.toJSONSchema(scoutTripIdeasResponseSchema, {
  unrepresentable: "any",
});
delete generatedJsonSchema.$schema;

export const scoutTripIdeasJsonSchema = generatedJsonSchema;
