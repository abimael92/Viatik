import type { Trip } from "@/features/domain/entities";
import type { MinorUnits } from "@/features/domain/money";

export type ReadinessStatus = "complete" | "missing";

export interface ReadinessItem {
  key: string;
  label: string;
  /** Short imperative label for the hero "next action" CTA, e.g. "Set dates". */
  action: string;
  /** Long-form hint shown beside a missing item, e.g. "Add your travel dates". */
  hint: string;
  status: ReadinessStatus;
  /** Trip workspace tab to deep-link to when the item is tapped. */
  targetTab: "settings" | "itinerary" | "travelers" | "finance" | "vault" | "packing";
}

export interface TripReadiness {
  score: number;
  completed: number;
  total: number;
  items: ReadinessItem[];
  nextAction: ReadinessItem | null;
}

export interface TripReadinessSummary {
  score: number;
  label: "Ready" | "Almost ready" | "Needs attention";
}

/**
 * Lightweight at-a-glance readiness for a library card. Unlike the full
 * `computeReadiness` (which needs budget/activity/member/vault queries), this
 * derives a score purely from trip-level fields so it can be shown cheaply on
 * every card without per-trip live queries.
 */
export function tripReadinessSummary(trip: Trip): TripReadinessSummary {
  const checks = [
    Boolean(trip.startDate && trip.endDate),
    Boolean(trip.destination),
    Boolean(trip.description),
    (trip.adultCount ?? 0) + (trip.childCount ?? 0) > 0,
    Boolean(trip.baseCurrency),
  ];
  const completed = checks.filter(Boolean).length;
  const score = Math.round((completed / checks.length) * 100);
  const label: TripReadinessSummary["label"] =
    score >= 80 ? "Ready" : score >= 40 ? "Almost ready" : "Needs attention";
  return { score, label };
}

export interface ReadinessInput {
  trip: Trip;
  /** Total trip budget in the trip's base currency (minor units), or `null` if unset. */
  totalBudgetMinor: MinorUnits | null;
  activityCount: number;
  memberCount: number;
  travelerCount: number;
  /** Explicit roster acknowledgement; omitted for legacy trips. */
  crewConfirmed?: boolean;
  /** Explicit packing acknowledgement; omitted for legacy trips. */
  packingConfirmed?: boolean;
  /** Explicit acknowledgement that the trip does not need a vault. */
  vaultNotNeeded?: boolean;
  vaultEntryCount: number;
  packingItemCount: number;
}

const DOCS_TAB = "vault" as const;
const PACKING_TAB = "packing" as const;
const TRAVELERS_TAB = "travelers" as const;

/**
 * Computes a trip-readiness score from real, typed signals in the local data
 * layer. Each checklist item maps to a concrete queryable source — there is no
 * heuristic keyword matching, so the score reflects what Viatik actually knows
 * about the trip.
 */
export function computeReadiness(input: ReadinessInput): TripReadiness {
  const { trip, totalBudgetMinor, activityCount, memberCount, travelerCount, crewConfirmed: explicitCrewConfirmed, packingConfirmed: explicitPackingConfirmed, vaultNotNeeded, vaultEntryCount, packingItemCount } = input;

  const datesSet = Boolean(trip.startDate && trip.endDate);
  const crewConfirmed = explicitCrewConfirmed ?? trip.crewConfirmed ?? (memberCount > 1 || travelerCount > 1);
  const packingConfirmed = explicitPackingConfirmed ?? trip.packingConfirmed ?? packingItemCount > 0;
  const budgetSet = totalBudgetMinor !== null && totalBudgetMinor > 0;

  const items: ReadinessItem[] = [
    {
      key: "dates",
      label: "Travel dates",
      action: "Set dates",
      hint: "Add your travel dates to unlock itinerary planning.",
      status: datesSet ? "complete" : "missing",
      targetTab: "settings",
    },
    {
      key: "itinerary",
      label: "Itinerary",
      action: "Plan itinerary",
      hint: "Add flights, stays, and activities to your itinerary.",
      status: activityCount > 0 ? "complete" : "missing",
      targetTab: "itinerary",
    },
    {
      key: "crew",
      label: "Crew confirmed",
      action: "Add travelers",
      hint: "Invite your travel crew so everyone stays in sync.",
      status: crewConfirmed ? "complete" : "missing",
      targetTab: TRAVELERS_TAB,
    },
    {
      key: "budget",
      label: "Budget planned",
      action: "Set a budget",
      hint: "Set a trip budget to track planned versus spent.",
      status: budgetSet ? "complete" : "missing",
      targetTab: "finance",
    },
    {
      key: "docs",
      label: "Docs in vault",
      action: "Add documents",
      hint: "Store bookings, insurance, and confirmations in the vault.",
      status: vaultEntryCount > 0 || vaultNotNeeded === true || trip.vaultNotNeeded === true ? "complete" : "missing",
      targetTab: DOCS_TAB,
    },
    {
      key: "packing",
      label: "Packing list",
      action: "Start packing",
      hint: "Add items to your packing list before you travel.",
      status: packingConfirmed ? "complete" : "missing",
      targetTab: PACKING_TAB,
    },
  ];

  const completed = items.filter((item) => item.status === "complete").length;
  const total = items.length;
  const score = total === 0 ? 0 : Math.round((completed / total) * 100);
  const nextAction = items.find((item) => item.status === "missing") ?? null;

  return { score, completed, total, items, nextAction };
}
