/**
 * AI Activity Scout domain contract.
 *
 * These types describe the structured output produced by the AI Activity Scout
 * before it is added to an itinerary. They are plain TypeScript types with no
 * dependency on Dexie or Supabase — the engine
 * (`features/ai/lib/ai-scout-generator.ts`) validates arbitrary "AI output"
 * against this contract and the drawer maps a validated suggestion into an
 * `Activity` via the `ActivityRepository`.
 */

import type { MinorUnits } from "@/features/domain/money";

/**
 * When an activity is best experienced. Used to pick a sensible default
 * `startTime` when the suggestion is added to a day.
 */
export type ScoutTimeOfDay = "morning" | "afternoon" | "evening" | "any";

/** Structured time-budget tier from the scout instruction. */
export type ScoutTimeTier = "quick-hit" | "half-session" | "deep-dive";

/** A single, modular activity suggestion that can be added to a trip day. */
export interface AiScoutSuggestion {
  title: string;
  /** Free-form category (matches `Activity.category`), e.g. "food", "culture". */
  category: string;
  /**
   * Specific structured category tag from the scout instruction, e.g.
   * "Photo Op", "Bar & Nightlife", "Physical/Active", "Shopping",
   * "Gastronomy", "Culture". Falls back to `category` when not supplied.
   */
  categoryTag: string;
  description: string | null;
  /** Human-readable duration, e.g. "2 hours". */
  durationLabel: string | null;
  /** Recommended time of day for this activity. */
  timeOfDay: ScoutTimeOfDay;
  /** Structured time-budget tier (e.g. "half-session"), or "any" if unknown. */
  timeTier: ScoutTimeTier | "any";
  /** Transit/logistics tip, e.g. "15 min metro ride from the center". */
  transitNote: string | null;
  /** Where the activity happens, when known. */
  location: string | null;
  /** Optional estimated cost in the trip's base currency (minor units). */
  estimatedCostMinor: MinorUnits | null;
  /** Structured price band, e.g. "$" to "$$$$". Null when not supplied. */
  costTier: string | null;
}

/** Destination + trip context the engine uses to make suggestions relevant. */
export interface AiScoutContext {
  /** Human-readable destination, e.g. "Kyoto". */
  destination: string;
  /** Trip base currency code (USD, EUR, ...). */
  currency: string;
  /** Number of days in the trip (used to vary recommendation times). */
  dayCount: number;
  /** Existing category counts, so the engine can diversify suggestions. */
  categoryCounts?: Record<string, number>;
}

/** Top-level payload produced by a scout run. */
export interface AiScoutResult {
  suggestions: AiScoutSuggestion[];
}

/**
 * Optional remote generation source. The default offline heuristic implements
 * this shape implicitly; a real LLM provider returns an async list of raw
 * suggestions that the engine validates before returning them.
 */
export interface ScoutProvider {
  /** Ask the provider for raw suggestions for `prompt` in `context`. */
  generate(prompt: string, context: AiScoutContext): Promise<unknown[]>;
}
