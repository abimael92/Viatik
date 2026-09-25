import { normalizeActivityCategory } from "@/features/activities/domain/activity-category";
import type { SpendingCategory } from "@/features/domain/categories";

const PURCHASE_KEYWORDS = [
  "pagar",
  "pago",
  "comprar",
  "compra",
  "compras",
  "entrada",
  "entradas",
  "ticket",
  "tickets",
  "estacionamiento",
  "parking",
  "buy",
  "pay",
  "paid",
  "fee",
  "toll",
  "peaje",
] as const;

const COST_VERBS = ["pagar", "pago", "comprar", "compra", "buy", "pay", "paid", "reservar", "reserve"] as const;
const RESERVATION_NOUNS = ["reserva", "reservation", "booking"] as const;

function normalizeTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

function hasWord(normalized: string, keyword: string): boolean {
  const pattern = new RegExp(`(?:^|[^\\p{L}\\p{N}])${keyword}(?:$|[^\\p{L}\\p{N}])`, "u");
  return pattern.test(normalized);
}

/** True when a Must-do title looks like a purchase the traveler may want to log. */
export function isPurchaseOrientedMustDo(title: string): boolean {
  const normalized = normalizeTitle(title);
  if (!normalized) return false;
  if (PURCHASE_KEYWORDS.some((keyword) => hasWord(normalized, keyword))) return true;
  return (
    COST_VERBS.some((verb) => hasWord(normalized, verb)) &&
    RESERVATION_NOUNS.some((noun) => hasWord(normalized, noun))
  );
}

/** Map an itinerary activity category onto a spending category for expense prefill. */
export function spendingCategoryFromActivity(category: string | null | undefined): SpendingCategory | null {
  switch (normalizeActivityCategory(category)) {
    case "transit":
      return "transport";
    case "lodging":
      return "stay";
    case "food-and-drink":
      return "food";
    case "sightseeing":
    case "entertainment":
    case "active":
      return "activities";
    case "shopping":
      return "shopping";
    default:
      return null;
  }
}
