/**
 * AI Activity Scout parsing & generation engine.
 *
 * Pure, dependency-inverted responsibilities kept side-effect free so they are
 * trivial to unit test:
 *
 * 1. `validateScoutResult` — normalizes arbitrary, untrusted "AI output" (e.g. a
 *    raw model response) into the stable `AiScoutResult` domain contract,
 *    converting decimal money into minor units, capping lengths, and skipping
 *    malformed items. Throws `AiScoutValidationError` on hard failures.
 * 2. `generateOfflineSuggestions` — a deterministic, destination-aware heuristic
 *    that produces contextual activity suggestions with duration, time-of-day,
 *    and transit metadata. This is the offline-first default.
 * 3. `generateScoutSuggestions` — orchestrates an optional `ScoutProvider`
 *    (remote LLM) and falls back to the offline heuristic on any failure or
 *    empty result.
 * 4. `createHttpScoutProvider` — builds a `ScoutProvider` that POSTs to a
 *    configurable endpoint (used server-side so the API key stays server-only).
 */

import {
  MAX_MINOR_UNITS,
  getCurrencyExponent,
  normalizeCurrencyCode,
  parseMinorUnits,
  type MinorUnits,
} from "@/features/domain/money";
import type {
  AiScoutContext,
  AiScoutResult,
  AiScoutSuggestion,
  ScoutProvider,
  ScoutTimeOfDay,
  ScoutTimeTier,
} from "@/features/ai/domain/ai-scout-types";

/** Thrown when scout output (or provider output) cannot be safely parsed. */
export class AiScoutValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiScoutValidationError";
  }
}

/* ---------------------------------------------------------------------------
 * Shared helpers
 * ------------------------------------------------------------------------- */

const MAX_TITLE = 120;
const MAX_DESCRIPTION = 500;
const MAX_CATEGORY = 60;
const MAX_DURATION = 60;
const MAX_TRANSIT = 160;
const MAX_LOCATION = 120;
const MAX_SUGGESTIONS = 12;

const VALID_TIMES = new Set<ScoutTimeOfDay>(["morning", "afternoon", "evening", "any"]);

const VALID_TIME_TIERS: Record<string, ScoutTimeTier> = {
  "quick hit": "quick-hit",
  quickhit: "quick-hit",
  quick: "quick-hit",
  "quick-hit": "quick-hit",
  "half session": "half-session",
  halfsession: "half-session",
  half: "half-session",
  "half-session": "half-session",
  "deep dive": "deep-dive",
  deepdive: "deep-dive",
  deep: "deep-dive",
  "deep-dive": "deep-dive",
};

function cap(value: string, max: number): string {
  return value.trim().slice(0, max);
}

function toTimeOfDay(value: unknown): ScoutTimeOfDay {
  const candidate = String(value ?? "").trim().toLowerCase();
  return VALID_TIMES.has(candidate as ScoutTimeOfDay) ? (candidate as ScoutTimeOfDay) : "any";
}

function toTimeTier(value: unknown): ScoutTimeTier | "any" {
  if (value === null || value === undefined) return "any";
  const key = String(value).trim().toLowerCase();
  return VALID_TIME_TIERS[key] ?? "any";
}

/** Normalize the LLM's price band ("$" to "$$$$") into a canonical "$…$$$$". */
function toCostTier(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const count = (String(value).match(/\$/g) ?? []).length;
  return count > 0 ? "$".repeat(Math.min(count, 4)) : null;
}

function toMinorUnits(value: unknown, currency: string, field: string): MinorUnits | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") {
    if (value < 0n || value > MAX_MINOR_UNITS) throw new AiScoutValidationError(`${field} is out of range`);
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) throw new AiScoutValidationError(`${field} must be a non-negative number`);
    value = String(value);
  }
  if (typeof value !== "string") throw new AiScoutValidationError(`${field} is required`);
  const cleaned = value.trim().replace(/[$€£,\s]/g, "");
  if (!cleaned) return null;
  try {
    return parseMinorUnits(cleaned, currency);
  } catch {
    throw new AiScoutValidationError(`Invalid ${field}: ${value}`);
  }
}

function nullIfEmpty(value: unknown, max: number): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed ? cap(trimmed, max) : null;
}

function assertCurrency(currency: string): string {
  try {
    return normalizeCurrencyCode(currency);
  } catch {
    throw new AiScoutValidationError(`Unsupported currency: ${currency}`);
  }
}

/* ---------------------------------------------------------------------------
 * 1. Validation / normalization of raw (LLM/provider) output
 * ------------------------------------------------------------------------- */

function normalizeSuggestion(raw: unknown, currency: string): AiScoutSuggestion | null {
  if (raw === null || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const title = String(item.title ?? "").trim();
  if (!title) return null;
  const category = cap(String(item.category ?? "general").trim(), MAX_CATEGORY) || "general";
  const categoryTag = nullIfEmpty(
    item.categoryTag ?? item.category_tag ?? item.tag ?? item.category,
    MAX_CATEGORY,
  );
  return {
    title: cap(title, MAX_TITLE),
    category,
    categoryTag: categoryTag ?? category,
    description: nullIfEmpty(item.description, MAX_DESCRIPTION),
    durationLabel: nullIfEmpty(item.durationLabel ?? item.duration, MAX_DURATION),
    timeOfDay: toTimeOfDay(item.timeOfDay),
    timeTier: toTimeTier(item.timeTier ?? item.time_tier ?? item.timeSpent ?? item.durationTier),
    transitNote: nullIfEmpty(item.transitNote ?? item.transit ?? item.logistics, MAX_TRANSIT),
    location: nullIfEmpty(item.location, MAX_LOCATION),
    estimatedCostMinor: toMinorUnits(
      item.estimatedCostMinor != null ? item.estimatedCostMinor : item.estimatedCost,
      currency,
      "estimatedCost",
    ),
    costTier: toCostTier(item.costTier ?? item.cost_tier ?? item.priceTier),
  };
}

/**
 * Normalize untrusted scout output into a valid `AiScoutResult`. Accepts
 * `estimatedCostMinor` (bigint) or `estimatedCost` (decimal) money fields,
 * caps lengths, skips malformed items, and throws `AiScoutValidationError` for
 * hard structural failures.
 */
export function validateScoutResult(input: unknown, currency: string): AiScoutResult {
  assertCurrency(currency);
  if (input === null || typeof input !== "object") {
    throw new AiScoutValidationError("Scout output must be an object");
  }
  const raw = input as Record<string, unknown>;
  if (!Array.isArray(raw.suggestions)) {
    throw new AiScoutValidationError("Scout output must include a suggestions array");
  }
  const suggestions = raw.suggestions
    .slice(0, MAX_SUGGESTIONS)
    .map((item) => normalizeSuggestion(item, currency))
    .filter((item): item is AiScoutSuggestion => item !== null);
  return { suggestions };
}

/* ---------------------------------------------------------------------------
 * 2. Offline, destination-aware heuristic generator
 * ------------------------------------------------------------------------- */

type SuggestionSeed = {
  title: string;
  category: string;
  description: string;
  durationLabel: string;
  timeOfDay: ScoutTimeOfDay;
  transitNote: string;
  location: string;
};

const KYOTO: SuggestionSeed[] = [
  { title: "Fushimi Inari shrine at first light", category: "culture", description: "Walk the famous torii gate tunnels before the crowds arrive.", durationLabel: "2 hours", timeOfDay: "morning", transitNote: "5 min walk from Inari Station (JR Nara line).", location: "Fushimi Inari-taisha" },
  { title: "Hidden bamboo grove walk", category: "outdoors", description: "A quieter detour through a bamboo grove and small moss gardens.", durationLabel: "1.5 hours", timeOfDay: "morning", transitNote: "10 min bus from Arashiyama station.", location: "Arashiyama" },
  { title: "Traditional kaiseki lunch", category: "food", description: "Multi-course seasonal tasting menu at a local ryokan.", durationLabel: "2 hours", timeOfDay: "afternoon", transitNote: "15 min taxi from central Gion.", location: "Gion" },
  { title: "Gion geisha-district lantern walk", category: "culture", description: "Lantern-lit lanes and tea houses as the district quiets down.", durationLabel: "1.5 hours", timeOfDay: "evening", transitNote: "5 min walk from Gion-Shijo Station.", location: "Gion district" },
  { title: "Nishiki market street-food crawl", category: "food", description: "Sample yakitori, mochi, and pickles along the 'Kyoto kitchen'.", durationLabel: "1.5 hours", timeOfDay: "afternoon", transitNote: "3 min walk from Shijo Station.", location: "Nishiki Market" },
  { title: "Zen meditation at a quiet temple", category: "culture", description: "A beginner-friendly zazen session at a hillside temple.", durationLabel: "1 hour", timeOfDay: "morning", transitNote: "20 min bus from Kyoto Station.", location: "Daitoku-ji" },
];

const ROME: SuggestionSeed[] = [
  { title: "Colosseum & Forum early entry", category: "culture", description: "Beat the queues with a morning visit to the ancient heart of Rome.", durationLabel: "3 hours", timeOfDay: "morning", transitNote: "Colosseo metro stop (line B).", location: "Roman Forum" },
  { title: "Hidden Trastevere backstreets", category: "culture", description: "Mosaic lanes, artisan shops, and a working basilica off the tourist trail.", durationLabel: "2 hours", timeOfDay: "afternoon", transitNote: "15 min walk across Ponte Sisto.", location: "Trastevere" },
  { title: "Roman trattoria lunch", category: "food", description: "Cacio e pepe and carbonara at a family-run spot.", durationLabel: "1.5 hours", timeOfDay: "afternoon", transitNote: "10 min walk from Campo de' Fiori.", location: "Testaccio" },
  { title: "Piazza Navona at golden hour", category: "sightseeing", description: "Bernini's fountains as the evening light softens over the square.", durationLabel: "1 hour", timeOfDay: "evening", transitNote: "5 min walk from Pantheon.", location: "Piazza Navona" },
  { title: "Aventine keyhole view", category: "sightseeing", description: "A surprise vista through a keyhole onto St. Peter's dome.", durationLabel: "45 minutes", timeOfDay: "morning", transitNote: "20 min walk from Circus Maximus.", location: "Aventine Hill" },
  { title: "Gelato & nightlife in Monti", category: "nightlife", description: "Late-evening gelato and aperitivo bars in a bohemian neighborhood.", durationLabel: "2 hours", timeOfDay: "evening", transitNote: "Cavour metro stop (line B).", location: "Monti" },
];

const PARIS: SuggestionSeed[] = [
  { title: "Early Louvre & Tuileries stroll", category: "culture", description: "Morning light over the pyramids before the galleries fill.", durationLabel: "3 hours", timeOfDay: "morning", transitNote: "Palais Royal – Musée du Louvre metro.", location: "Louvre" },
  { title: "Le Marais food & vintage walk", category: "food", description: "Bakeries, fromageries, and vintage shops in the old Jewish quarter.", durationLabel: "2 hours", timeOfDay: "afternoon", transitNote: "Saint-Paul metro (line 1).", location: "Le Marais" },
  { title: "Hidden canal-side cafés", category: "food", description: "Quiet terraces along the Canal Saint-Martin away from the crowds.", durationLabel: "1.5 hours", timeOfDay: "afternoon", transitNote: "République metro (lines 3/5/8/9/11).", location: "Canal Saint-Martin" },
  { title: "Eiffel Tower sunset picnic", category: "sightseeing", description: "Champagne and charcuterie on the Champ de Mars at sunset.", durationLabel: "2 hours", timeOfDay: "evening", transitNote: "Trocadéro metro (line 6/9).", location: "Champ de Mars" },
  { title: "Montmartre artists' lanes", category: "culture", description: "Sacré-Cœur and the steep, cobbled lanes of the hilltop village.", durationLabel: "2 hours", timeOfDay: "morning", transitNote: "Anvers metro then the funicular.", location: "Montmartre" },
  { title: "Latin Quarter bookshop hop", category: "culture", description: "Shakespeare & Co. and boulevard cafés in the student quarter.", durationLabel: "1.5 hours", timeOfDay: "afternoon", transitNote: "Saint-Michel – Notre-Dame metro.", location: "Latin Quarter" },
];

const DESTINATION_POOLS: Record<string, SuggestionSeed[]> = {
  kyoto: KYOTO,
  rome: ROME,
  paris: PARIS,
};

/** Fallback pool used when no destination-specific pool is defined. */
function genericSeeds(destination: string): SuggestionSeed[] {
  return [
    { title: "Guided old-town walking tour", category: "culture", description: "See the historic quarter's main sights with a local guide.", durationLabel: "2 hours", timeOfDay: "morning", transitNote: "Meet at the central square.", location: destination },
    { title: "Local market breakfast", category: "food", description: "Taste regional specialties at the neighborhood food market.", durationLabel: "1.5 hours", timeOfDay: "morning", transitNote: "10 min walk from the center.", location: destination },
    { title: "Offbeat neighborhood ramble", category: "culture", description: "Quiet streets, street art, and small local cafés.", durationLabel: "2 hours", timeOfDay: "afternoon", transitNote: "15 min bus from downtown.", location: destination },
    { title: "Signature dinner spot", category: "food", description: "A recommended restaurant for a relaxed local dinner.", durationLabel: "2 hours", timeOfDay: "evening", transitNote: "5 min taxi from the center.", location: destination },
    { title: "Scenic viewpoint at sunset", category: "sightseeing", description: "A panoramic lookout that comes alive at golden hour.", durationLabel: "1 hour", timeOfDay: "evening", transitNote: "20 min walk uphill or short drive.", location: destination },
    { title: "Outdoor escape to the hills", category: "outdoors", description: "A short hike or riverside trail just outside the city.", durationLabel: "3 hours", timeOfDay: "morning", transitNote: "30 min by local transport.", location: destination },
  ];
}

const CATEGORY_KEYWORDS: Array<[string, RegExp]> = [
  ["food", /\b(food|eat|eat|restaurant|cafe|culinary|dining|market|bakery|foodie)\b/i],
  ["culture", /\b(culture|cultural|museum|history|historic|art|heritage|temples?|galleries)\b/i],
  ["outdoors", /\b(nature|outdoor|hike|hiking|park|garden|trail|viewpoint|scenic)\b/i],
  ["nightlife", /\b(night|nightlife|bars?|clubs?|evening|sunset)\b/i],
  ["sightseeing", /\b(landmark|must.?see|sights|sightseeing|iconic|top)\b/i],
];

function normalizeDestinationKey(destination: string): string {
  return destination.toLowerCase().replace(/[^a-z]+/g, "").trim();
}

function detectPreferredCategory(prompt: string): string | null {
  for (const [category, pattern] of CATEGORY_KEYWORDS) {
    if (pattern.test(prompt)) return category;
  }
  return null;
}

function estimateCostMinor(category: string, currency: string): MinorUnits {
  const exponent = getCurrencyExponent(currency);
  const whole = category === "food" ? 25 : category === "nightlife" ? 30 : category === "culture" ? 15 : 10;
  return BigInt(Math.round(whole * 10 ** exponent));
}

/** Derive a "$"–"$$$$" band from an estimated cost in minor units. */
function costTierFromMinor(costMinor: MinorUnits, currency: string): string {
  const whole = Number(costMinor) / 10 ** getCurrencyExponent(currency);
  if (whole < 15) return "$";
  if (whole < 35) return "$$";
  if (whole < 70) return "$$$";
  return "$$$$";
}

/**
 * Deterministic, offline, destination-aware suggestion generation. Picks a
 * destination pool when known (otherwise a generic pool), orders seeds by the
 * prompt's implied category when present, and caps the result.
 */
export function generateOfflineSuggestions(prompt: string, context: AiScoutContext): AiScoutSuggestion[] {
  const destination = context.destination?.trim() || "City";
  const preferredCategory = detectPreferredCategory(prompt);
  const pool = DESTINATION_POOLS[normalizeDestinationKey(destination)] ?? genericSeeds(destination);

  const ranked = [...pool].sort((a, b) => {
    if (preferredCategory == null) return 0;
    const aMatch = a.category === preferredCategory ? 0 : 1;
    const bMatch = b.category === preferredCategory ? 0 : 1;
    return aMatch - bMatch;
  });

  return ranked.slice(0, 6).map((seed) => {
    const estimatedCostMinor = estimateCostMinor(seed.category, context.currency || "USD");
    return {
      title: seed.title,
      category: seed.category,
      categoryTag: seed.category,
      description: seed.description,
      durationLabel: seed.durationLabel,
      timeOfDay: seed.timeOfDay,
      timeTier: "any",
      transitNote: seed.transitNote,
      location: seed.location,
      estimatedCostMinor,
      costTier: costTierFromMinor(estimatedCostMinor, context.currency || "USD"),
    };
  });
}

/* ---------------------------------------------------------------------------
 * 3. Orchestrator with optional provider + offline fallback
 * ------------------------------------------------------------------------- */

/**
 * Generate suggestions for `prompt`, preferring an optional `ScoutProvider`
 * (remote LLM). If the provider is absent, throws, or returns an empty/invalid
 * result, falls back to the deterministic offline heuristic.
 */
export async function generateScoutSuggestions(
  prompt: string,
  context: AiScoutContext,
  provider?: ScoutProvider,
): Promise<AiScoutResult> {
  if (provider) {
    try {
      const raw = await provider.generate(prompt, context);
      const result = validateScoutResult({ suggestions: raw }, context.currency || "USD");
      if (result.suggestions.length > 0) return result;
    } catch {
      // fall through to the offline heuristic
    }
  }
  return { suggestions: generateOfflineSuggestions(prompt, context) };
}

/* ---------------------------------------------------------------------------
 * 4. Configurable HTTP provider (used server-side to protect the API key)
 * ------------------------------------------------------------------------- */

/**
 * Build a `ScoutProvider` that POSTs `{ prompt, context }` to `endpoint`,
 * expecting either a `{ suggestions: [...] }` object or a bare array in the
 * response. Includes an authorization bearer header when `apiKey` is set and a
 * 15s timeout.
 */
export function createHttpScoutProvider(options: { endpoint: string; apiKey?: string }): ScoutProvider {
  return {
    async generate(prompt: string, context: AiScoutContext): Promise<unknown[]> {
      const response = await fetch(options.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}),
        },
        body: JSON.stringify({ prompt, context }),
        signal: AbortSignal.timeout(15000),
        cache: "no-store",
      });
      if (!response.ok) {
        throw new AiScoutValidationError(`Scout endpoint responded with ${response.status}`);
      }
      const payload = (await response.json()) as unknown;
      if (Array.isArray(payload)) return payload;
      if (payload && typeof payload === "object") {
        const suggestions = (payload as { suggestions?: unknown }).suggestions;
        if (Array.isArray(suggestions)) return suggestions;
      }
      throw new AiScoutValidationError("Scout endpoint returned an unexpected shape");
    },
  };
}
