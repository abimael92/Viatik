/**
 * Predefined spending categories for the unified money tracker.
 *
 * Each top-level category groups a fixed set of subcategories. This constant
 * map is the single source of truth shared by the Expense model (to classify
 * a cost) and the TripBudget model (to cap spending per category), so the
 * category vocabulary can never drift between the two.
 *
 * Categories are stored as stable string keys — never translated, never
 * re-ordered — so persisted data stays interpretable across locales and app
 * versions. Use the `SPENDING_CATEGORY_LABELS` / `SPENDING_SUBCATEGORY_LABELS`
 * maps (or a formatter) for any user-facing display.
 */

export const SPENDING_CATEGORIES = {
  transport: ["flights", "uber", "gas", "cabs"],
  stay: ["hotel", "airbnb", "motel"],
  food: ["restaurants", "water", "snacks"],
  activities: ["excursions", "tickets"],
  shopping: ["gifts", "markets"],
  personal: ["toiletries", "pharmacy"],
} as const;

export type SpendingCategory = keyof typeof SPENDING_CATEGORIES;
export type SpendingSubcategory = (typeof SPENDING_CATEGORIES)[SpendingCategory][number];

export const SPENDING_CATEGORY_KEYS = Object.keys(SPENDING_CATEGORIES) as SpendingCategory[];

/** Type guard for top-level category keys. */
export function isSpendingCategory(value: unknown): value is SpendingCategory {
  return typeof value === "string" && (SPENDING_CATEGORIES as Record<string, unknown>)[value] !== undefined;
}

/** Type guard for subcategory keys (checks membership across every category). */
export function isSpendingSubcategory(value: unknown): value is SpendingSubcategory {
  return (
    typeof value === "string" &&
    SPENDING_CATEGORY_KEYS.some((key) =>
      (SPENDING_CATEGORIES[key] as readonly string[]).includes(value)
    )
  );
}

/** Human-readable label for a top-level category (e.g. "transport" → "Transport"). */
export const SPENDING_CATEGORY_LABELS: Record<SpendingCategory, string> = {
  transport: "Transport",
  stay: "Stay",
  food: "Food",
  activities: "Activities",
  shopping: "Shopping",
  personal: "Personal",
};

/** Human-readable label for a subcategory (e.g. "uber" → "Rideshare"). */
export const SPENDING_SUBCATEGORY_LABELS: Record<SpendingSubcategory, string> = {
  flights: "Flights",
  uber: "Rideshare",
  gas: "Fuel",
  cabs: "Cabs",
  hotel: "Hotel",
  airbnb: "Vacation rental",
  motel: "Motel",
  restaurants: "Restaurants",
  water: "Water",
  snacks: "Snacks",
  excursions: "Excursions",
  tickets: "Tickets",
  gifts: "Gifts",
  markets: "Markets",
  toiletries: "Toiletries",
  pharmacy: "Pharmacy",
};
