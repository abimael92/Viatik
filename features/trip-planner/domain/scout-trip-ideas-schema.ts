import { z } from "zod";

export const SCOUT_SUPPORTED_CURRENCIES = ["CAD", "EUR", "GBP", "JPY", "MXN", "USD"] as const;
export const SCOUT_SUPPORTED_LOCALES = ["en", "es"] as const;
export const SCOUT_TIMINGS = ["asap", "month", "cheapest"] as const;
export const SCOUT_TRIP_LENGTHS = ["any", "weekend", "week", "two-weeks"] as const;
export const SCOUT_COMFORT_LEVELS = ["budget", "balanced", "premium"] as const;
export const SCOUT_STAY_STYLES = ["hotel", "rental", "either"] as const;

/** Number of ideas a first run returns. */
export const SCOUT_INITIAL_IDEA_COUNT = 5;
/** Number of ideas each "add more" run returns. */
export const SCOUT_MORE_IDEA_COUNT = 2;
export const SCOUT_MAX_IDEA_COUNT = SCOUT_INITIAL_IDEA_COUNT + SCOUT_MORE_IDEA_COUNT;

export const scoutTripIdeasInputSchema = z.object({
  vibe: z.string().trim().min(2).max(240),
  crewSize: z.number().int().min(1).max(20),
  savingsCapacityMinor: z.string().regex(/^\d{1,11}$/),
  savingsCadence: z.enum(["weekly", "monthly"]),
  currency: z.enum(SCOUT_SUPPORTED_CURRENCIES),
  consentToAI: z.literal(true),
  locale: z.enum(SCOUT_SUPPORTED_LOCALES).default("en"),
  count: z.number().int().min(1).max(SCOUT_MAX_IDEA_COUNT).default(SCOUT_INITIAL_IDEA_COUNT),
  excludeDestinations: z.array(z.string().trim().min(3).max(120)).max(20).default([]),
  /** Departure city or airport; empty when the traveler skipped the step. */
  originCity: z.string().trim().max(120).default(""),
  timing: z.enum(SCOUT_TIMINGS).default("asap"),
  /** `YYYY-MM`, only meaningful when `timing` is `"month"`. */
  targetMonth: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .nullable()
    .default(null),
  tripLength: z.enum(SCOUT_TRIP_LENGTHS).default("any"),
  comfort: z.enum(SCOUT_COMFORT_LEVELS).default("balanced"),
  stayStyle: z.enum(SCOUT_STAY_STYLES).default("either"),
  nonstopOnly: z.boolean().default(false),
  constraints: z.string().trim().max(200).default(""),
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
        "Estimated daily cost per person for meals, local transport, and activities in standard whole currency units (e.g., 150 for $150), excluding lodging. Do not output minor units."
      ),
    estimated_hotel_per_night: z
      .number()
      .int()
      .min(1)
      .max(100_000_000)
      .describe(
        "Estimated hotel rate per night for the whole group in standard whole currency units (e.g., 180 for $180), one room. Do not output minor units."
      ),
    estimated_alt_stay_per_night: z
      .number()
      .int()
      .min(1)
      .max(100_000_000)
      .describe(
        "Estimated vacation-rental (Airbnb-style) rate per night for the whole group in standard whole currency units (e.g., 140 for $140). Do not output minor units."
      ),
    scout_pitch: scoutPitchSchema,
  })
  .strict();

export const scoutTripIdeasResponseSchema = z
  .object({
    ideas: z.array(scoutTripIdeaSchema).min(1).max(SCOUT_MAX_IDEA_COUNT),
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
