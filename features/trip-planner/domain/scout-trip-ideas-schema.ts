import { z } from "zod";

export const SCOUT_SUPPORTED_CURRENCIES = ["CAD", "EUR", "GBP", "JPY", "MXN", "USD"] as const;
export const SCOUT_SUPPORTED_LOCALES = ["en", "es"] as const;
export const SCOUT_TIMINGS = ["asap", "month", "cheapest", "dates"] as const;
export const SCOUT_TRIP_LENGTHS = ["any", "weekend", "week", "two-weeks"] as const;
export const SCOUT_COMFORT_LEVELS = ["budget", "balanced", "premium"] as const;
export const SCOUT_STAY_STYLES = ["hotel", "rental", "either"] as const;

/** Number of ideas a first run returns. */
export const SCOUT_INITIAL_IDEA_COUNT = 5;
/** Number of ideas each "add more" run returns. */
export const SCOUT_MORE_IDEA_COUNT = 2;
export const SCOUT_MAX_IDEA_COUNT = SCOUT_INITIAL_IDEA_COUNT + SCOUT_MORE_IDEA_COUNT;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function parseDateOnly(value: string): Date | null {
  if (!DATE_ONLY.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function calendarDaysBetween(start: string, end: string): number | null {
  const from = parseDateOnly(start);
  const to = parseDateOnly(end);
  if (!from || !to) return null;
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

const scoutTripIdeasInputObject = z.object({
  /** Required (min 2) in idea mode; `""` is allowed when a destination is pinned. */
  vibe: z.string().trim().max(240),
  crewSize: z.number().int().min(1).max(20),
  savingsCapacityMinor: z.string().regex(/^\d{1,11}$/),
  savingsCadence: z.enum(["weekly", "monthly"]),
  currency: z.enum(SCOUT_SUPPORTED_CURRENCIES),
  consentToAI: z.literal(true),
  locale: z.enum(SCOUT_SUPPORTED_LOCALES).default("en"),
  count: z.number().int().min(1).max(SCOUT_MAX_IDEA_COUNT).default(SCOUT_INITIAL_IDEA_COUNT),
  excludeDestinations: z.array(z.string().trim().min(3).max(120)).max(20).default([]),
  /** Route signatures of options already shown; used instead of destinations in route mode. */
  excludeRoutes: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  /** Exact `City, Country` destination; empty keeps "surprise me" idea mode. */
  destination: z
    .string()
    .trim()
    .max(120)
    .default("")
    .refine((destination) => !destination || destination.includes(","), {
      message: "Use a city and country destination.",
    }),
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
  /** Exact trip length the traveler typed; wins over the `tripLength` preset. */
  durationDays: z.number().int().min(1).max(60).nullable().default(null),
  /** Exact dates; required and ordered only when `timing` is `"dates"`. */
  startDate: z.string().regex(DATE_ONLY).nullable().default(null),
  endDate: z.string().regex(DATE_ONLY).nullable().default(null),
  comfort: z.enum(SCOUT_COMFORT_LEVELS).default("balanced"),
  stayStyle: z.enum(SCOUT_STAY_STYLES).default("either"),
  nonstopOnly: z.boolean().default(false),
  constraints: z.string().trim().max(200).default(""),
});

export const scoutTripIdeasInputSchema = scoutTripIdeasInputObject.superRefine((input, ctx) => {
  if (!input.destination && input.vibe.length < 2) {
    ctx.addIssue({
      code: "custom",
      path: ["vibe"],
      message: "Tell Scout the vibe you are after.",
    });
  }
  if (input.timing !== "dates") return;
  if (!input.startDate || !input.endDate) {
    ctx.addIssue({
      code: "custom",
      path: ["startDate"],
      message: "Exact dates need both a start and an end date.",
    });
    return;
  }
  const days = calendarDaysBetween(input.startDate, input.endDate);
  if (days === null || days < 0) {
    ctx.addIssue({
      code: "custom",
      path: ["endDate"],
      message: "The end date must be on or after the start date.",
    });
    return;
  }
  if (days + 1 > 60) {
    ctx.addIssue({
      code: "custom",
      path: ["endDate"],
      message: "Trips can be up to 60 days long.",
    });
  }
});
const scoutPitchSchema = z
  .string()
  .trim()
  .min(20)
  .max(400)
  .describe(
    "Exactly two sentences. The first captures the sensory atmosphere and authentic highlights of the destination and why it matches the traveler's vibe. The second ties the pick to practical group ease, travel simplicity, or budget friendliness."
  )
  .refine((pitch) => (pitch.match(/[.!?](?:\s|$)/g) ?? []).length === 2, {
    message: "Scout's pitch must have exactly two sentences.",
  });

export const SCOUT_CONTINENTS = [
  "Africa",
  "Asia",
  "Europe",
  "North America",
  "South America",
  "Oceania",
] as const;

export const scoutFlightRouteSchema = z
  .object({
    legs: z
      .array(
        z
          .object({
            from: z
              .string()
              .trim()
              .min(2)
              .max(80)
              .describe("Departure city name or IATA code of this leg."),
            to: z
              .string()
              .trim()
              .min(2)
              .max(80)
              .describe("Arrival city name or IATA code of this leg."),
            approx_duration_minutes: z
              .number()
              .int()
              .min(20)
              .max(1500)
              .describe("Estimated airborne time for this leg in minutes."),
            layover_after_minutes: z
              .number()
              .int()
              .min(0)
              .max(720)
              .describe("Estimated layover after this leg in minutes; 0 for the last leg."),
          })
          .strict()
      )
      .min(1)
      .max(4)
      .describe(
        "Ordered flight legs from the departure city to the destination. Each leg's `to` must be the next leg's `from`."
      ),
    arrives_same_date: z
      .boolean()
      .describe("True when the route plausibly lands on the same calendar date it departs."),
  })
  .strict()
  .refine(
    (route) =>
      route.legs.every(
        (leg, index) =>
          index === 0 ||
          leg.from.trim().toLowerCase() === route.legs[index - 1]!.to.trim().toLowerCase()
      ),
    { message: "Flight legs must connect: each `from` equals the previous `to`." }
  );

export type ScoutFlightRoute = z.infer<typeof scoutFlightRouteSchema>;

export const scoutTripIdeaSchema = z
  .object({
    continent: z.enum(SCOUT_CONTINENTS).describe("The continent the destination belongs to."),
    flight_route: scoutFlightRouteSchema.describe(
      "An estimated route from the departure city to this destination. Estimates only: never invent airlines, flight numbers, or schedules."
    ),
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
