/**
 * Smart Packing Lists domain entities. Local-only: packing items are private,
 * per-device to-dos (like `profiles` and `tripPins`) and never sync to
 * Supabase. They are derived from trip metadata and a collaborator's own
 * checklist, so there is no shared remote table.
 */

export type PackingCategory = "clothing" | "electronics" | "documents" | "gear";

export const PACKING_CATEGORIES: PackingCategory[] = [
  "clothing",
  "electronics",
  "documents",
  "gear",
];

/** Human labels used by the UI and the generator. */
export const PACKING_CATEGORY_LABELS: Record<PackingCategory, string> = {
  clothing: "Clothing",
  electronics: "Electronics",
  documents: "Documents",
  gear: "Gear",
};

/**
 * A single line item on a trip's packing list.
 *
 * - `isSuggested` marks items auto-generated from trip context vs. custom
 *   additions. Suggested items are re-seeded when the trip context changes and
 *   can be removed by the generator; custom items always survive regeneration.
 * - `suggestedReason` records which rule produced the item (e.g.
 *   "activity:outdoors") so users can see why something was added.
 */
export interface PackingItem {
  id: string;
  tripId: string;
  category: PackingCategory;
  name: string;
  quantity: number;
  isPacked: boolean;
  isSuggested: boolean;
  suggestedReason: string | null;
  position: number;
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
  deletedAt: string | null;
}

/**
 * A generated, not-yet-persisted packing suggestion. Kept separate from
 * `PackingItem` so the generator stays pure and side-effect free (no ids or
 * timestamps are stamped here).
 */
export interface PackingDraft {
  category: PackingCategory;
  name: string;
  quantity: number;
  reason: string | null;
}

/** Inputs the smart generator inspects to build the packing list. */
export interface PackingGenerationInput {
  /** Number of nights the trip covers (may be unknown). */
  durationDays: number | null;
  /** Trip start date as ISO `yyyy-mm-dd` (used for season inference). */
  startDate: string | null;
  /** Trip latitude (used for broad climate inference). */
  latitude: number | null;
  /** Scheduled itinerary activities; category/title drive gear rules. */
  activities: Array<{
    category: string;
    title: string;
    description?: string | null;
  }>;
  /** Derived weather warnings (e.g. heavyRain, freezing) to bias clothing. */
  weatherWarnings?: Array<{ type: string; severity: string }>;
}

export interface PackingRepository {
  listByTrip(tripId: string): Promise<PackingItem[]>;
  watchByTrip(tripId: string, onChange: (items: PackingItem[]) => void): () => void;
  toggle(id: string, isPacked: boolean): Promise<void>;
  addCustom(input: {
    tripId: string;
    category: PackingCategory;
    name: string;
    quantity?: number;
  }): Promise<PackingItem>;
  remove(id: string): Promise<void>;
  /** Reconcile generated suggestions with existing items, preserving custom
   *  additions and packed state. Returns the resulting list. */
  applySuggested(tripId: string, drafts: PackingDraft[]): Promise<PackingItem[]>;
}
