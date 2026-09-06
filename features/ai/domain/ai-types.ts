/**
 * AI Trip Builder domain contract.
 *
 * These types describe the structured output produced by the AI Trip Builder
 * and assistant before it is persisted. They are plain TypeScript types with
 * no dependency on Dexie or Supabase — the parsing & ingestion engine
 * (`features/ai/lib/ai-generator.ts`) validates arbitrary "AI output" against
 * this contract and maps it into the app's domain entities.
 */

import type { MinorUnits } from "@/features/domain/money";
import type { PackingCategory } from "@/features/packing/domain/packing-types";

/** A parsed/normalized natural-language prompt plus the context needed to generate. */
export interface AiPromptRequest {
  /** Raw, untrusted natural-language prompt (e.g. "3 days in Rome on a $1,000 budget"). */
  prompt: string;
  /** Trip base currency the generated budget should be expressed in. */
  currency: string;
  /** Optional start date (yyyy-mm-dd) used when the prompt omits one. */
  startDate?: string | null;
  /** Optional trip to enhance instead of creating a new one. */
  tripId?: string | null;
  adultCount?: number;
  childCount?: number;
}

/** Top-level structured itinerary payload produced by a generator. */
export interface AiItineraryPayload {
  trip: AiTripNode;
  /** One node per itinerary day, in chronological order. */
  days: AiDayNode[];
  /** Optional overall budget broken into planned expense line items. */
  budget: AiBudgetNode | null;
  /** Optional packing suggestions for the trip. */
  packing: AiPackingNode[];
  /** Optional free-text summary/notes from the generator. */
  notes?: string | null;
}

/** Trip-level metadata for the generated plan. */
export interface AiTripNode {
  name: string;
  destination: string;
  description?: string | null;
  /** ISO date (yyyy-mm-dd). */
  startDate: string;
  /** ISO date (yyyy-mm-dd). */
  endDate: string;
  baseCurrency: string;
  /** Overall trip budget in `baseCurrency` minor units, when known. */
  totalBudgetMinor: MinorUnits | null;
  adultCount: number;
  childCount: number;
}

/** A single itinerary day. */
export interface AiDayNode {
  /** ISO date (yyyy-mm-dd) this day belongs to. */
  dayDate: string;
  /** Optional theme/label for the day (e.g. "Culture"). */
  theme?: string | null;
  activities: AiActivityNode[];
}

/** A single scheduled activity on a given day. */
export interface AiActivityNode {
  title: string;
  description?: string | null;
  location?: string | null;
  category: string;
  /** ISO datetime, when a start time is known. */
  startTime?: string | null;
  /** ISO datetime, when an end time is known. */
  endTime?: string | null;
  /** Planned/estimated cost in the trip's base currency (minor units). */
  estimatedCostMinor?: MinorUnits | null;
}

/** A planned budget line item — maps to an `Expense` record. */
export interface AiBudgetNode {
  /** Overall budget total in minor units of the trip's base currency. */
  totalMinor: MinorUnits;
  items: AiExpenseNode[];
}

/** A single planned expense / budget line item. */
export interface AiExpenseNode {
  description: string;
  /** Amount in minor units of the trip's base currency. */
  amountMinor: MinorUnits;
  categoryId?: string | null;
  /** ISO date (yyyy-mm-dd) the planned expense is associated with. */
  date?: string | null;
}

/** A packing suggestion — maps to a `PackingItem` (via `PackingDraft`). */
export interface AiPackingNode {
  category: PackingCategory;
  name: string;
  quantity: number;
  /** Why the item was suggested (e.g. "climate", "activity:outdoors"). */
  reason?: string | null;
}

/**
 * Lifecycle state of a single generation run inside the assistant modal.
 * Drives loading, preview, and error UI without leaking implementation detail.
 */
export type AiGenerationState =
  | { status: "idle" }
  | { status: "generating" }
  | { status: "ready"; result: AiItineraryPayload }
  | { status: "error"; message: string };

/** Summary of what was persisted by an "Apply to Trip" action. */
export interface AiApplyResult {
  tripId: string;
  /** True when a brand-new trip was created (vs. enhancing an existing one). */
  created: boolean;
  counts: {
    activities: number;
    expenses: number;
    packing: number;
  };
}
