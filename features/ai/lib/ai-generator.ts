/**
 * AI Trip Builder parsing & ingestion engine.
 *
 * Three pure responsibilities live here, kept side-effect free so they are
 * trivial to unit test:
 *
 * 1. `validateAiPayload` — normalizes arbitrary "AI output" JSON (e.g. a raw
 *    model response) into the stable `AiItineraryPayload` domain contract,
 *    converting decimal money into minor units and applying safe defaults.
 *    Throws `AiValidationError` on hard failures so a bad response never
 *    becomes bad data.
 * 2. `parsePromptToPayload` — an offline, rule-based natural-language parser
 *    that turns a prompt like "3 days in Rome on a $1,000 budget" into a valid
 *    `AiItineraryPayload`. This is the fallback that keeps the assistant fully
 *    offline-capable; a remote LLM can be plugged in later by returning a
 *    payload through the same contract.
 * 3. Builders + `applyAiPayload` — map a validated payload into `NewTrip`,
 *    `NewActivity`, `NewExpense`, and `PackingDraft` inputs and persist them
 *    through injected repository interfaces (dependency-inverted, so tests use
 *    fakes).
 */

import { MAX_MINOR_UNITS, getCurrencyExponent, normalizeCurrencyCode, parseMinorUnits, type MinorUnits } from "@/features/domain/money";
import type { NewActivity, ActivityRepository } from "@/features/domain/repositories/activity-repository";
import type { NewExpense, ExpenseRepository } from "@/features/domain/repositories/expense-repository";
import type { NewTrip, TripRepository } from "@/features/domain/repositories/trip-repository";
import type { PackingDraft, PackingRepository } from "@/features/packing/domain/packing-types";
import { generatePackingDrafts } from "@/features/packing/lib/packing-generator";
import type {
  AiActivityNode,
  AiApplyResult,
  AiBudgetNode,
  AiDayNode,
  AiExpenseNode,
  AiItineraryPayload,
  AiPackingNode,
  AiPromptRequest,
  AiTripNode,
} from "@/features/ai/domain/ai-types";

/** Thrown when AI output (or prompt-derived output) cannot be safely parsed. */
export class AiValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiValidationError";
  }
}

/* ---------------------------------------------------------------------------
 * Shared money & date helpers
 * ------------------------------------------------------------------------- */

const MAX_ACTIVITIES_PER_DAY = 12;
const MAX_DAYS = 60;
const MAX_TITLE = 120;
const MAX_DESCRIPTION = 500;
const MAX_NAME = 120;
const MAX_DESTINATION = 120;

function assertCurrency(currency: string, field = "currency"): string {
  try {
    return normalizeCurrencyCode(currency);
  } catch {
    throw new AiValidationError(`Unsupported ${field}: ${currency}`);
  }
}

function toMinorUnits(value: unknown, currency: string, field: string): MinorUnits {
  const code = assertCurrency(currency, field);
  if (typeof value === "bigint") {
    if (value < 0n || value > MAX_MINOR_UNITS) throw new AiValidationError(`${field} is out of range`);
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) throw new AiValidationError(`${field} must be a non-negative number`);
    value = String(value);
  }
  if (typeof value !== "string") throw new AiValidationError(`${field} is required`);
  const cleaned = value.trim().replace(/[$€£,\s]/g, "");
  if (!cleaned) throw new AiValidationError(`${field} is required`);
  try {
    return parseMinorUnits(cleaned, code);
  } catch {
    throw new AiValidationError(`Invalid ${field}: ${value}`);
  }
}

/** Round a fractional amount of whole units into minor units. */
function wholeToMinor(units: number, currency: string): MinorUnits {
  const exponent = getCurrencyExponent(currency);
  return BigInt(Math.round(units * 10 ** exponent));
}

/** Split a total (minor units) across weighted buckets, rounding to the exact total. */
function splitMinor(total: MinorUnits, weights: number[]): MinorUnits[] {
  if (weights.length === 0) return [];
  const weightSum = weights.reduce((a, b) => a + b, 0) || 1;
  const parts = weights.map((w) => (total * BigInt(Math.round((w / weightSum) * 1000))) / 1000n);
  const used = parts.reduce((a, b) => a + b, 0n);
  parts[parts.length - 1] = parts[parts.length - 1] + (total - used);
  return parts;
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00`).getTime());
}

function cap(value: string, max: number): string {
  return value.slice(0, max);
}

/* ---------------------------------------------------------------------------
 * 1. Schema validation / normalization of raw AI output
 * ------------------------------------------------------------------------- */

/**
 * Normalize raw, untrusted AI output into a valid `AiItineraryPayload`.
 * Accepts both `*Minor` (bigint) and decimal (`number`/`string`) money fields,
 * applies safe defaults, and throws `AiValidationError` for hard failures.
 */
export function validateAiPayload(input: unknown): AiItineraryPayload {
  if (input === null || typeof input !== "object") {
    throw new AiValidationError("AI output must be an object");
  }
  const raw = input as Record<string, unknown>;
  const rawTrip = (raw.trip ?? {}) as Record<string, unknown>;
  if (typeof rawTrip !== "object" || rawTrip === null) throw new AiValidationError("Missing trip object");

  const baseCurrency = assertCurrency(String(rawTrip.baseCurrency ?? "USD"), "baseCurrency");
  const destination = cap(String(rawTrip.destination ?? rawTrip.name ?? "City").trim() || "City", MAX_DESTINATION);
  const name = cap(String(rawTrip.name ?? rawTrip.destination ?? "Trip").trim() || "Trip", MAX_NAME);
  const startDate = String(rawTrip.startDate ?? "").trim();
  const endDate = String(rawTrip.endDate ?? "").trim();
  if (!isIsoDate(startDate) || !isIsoDate(endDate) || endDate < startDate) {
    throw new AiValidationError("Trip start and end dates must be valid ISO dates with start <= end");
  }
  const totalBudgetMinor =
    rawTrip.totalBudgetMinor != null
      ? toMinorUnits(rawTrip.totalBudgetMinor, baseCurrency, "totalBudget")
      : rawTrip.totalBudget != null
        ? toMinorUnits(rawTrip.totalBudget, baseCurrency, "totalBudget")
        : null;
  const adultCount = clampInt(rawTrip.adultCount, 1, 99, 1);
  const childCount = clampInt(rawTrip.childCount, 0, 99, 0);

  const rawDays = Array.isArray(raw.days) ? raw.days : [];
  const days = rawDays.slice(0, MAX_DAYS).map(normalizeDay);
  if (days.length === 0) throw new AiValidationError("AI output must include at least one itinerary day");

  const budget = normalizeBudget(raw.budget, baseCurrency, totalBudgetMinor);
  const packing = Array.isArray(raw.packing) ? raw.packing.slice(0, 200).map(normalizePacking) : [];

  const trip: AiTripNode = {
    name,
    destination,
    description: rawTrip.description != null ? cap(String(rawTrip.description).trim(), MAX_DESCRIPTION) || null : null,
    startDate,
    endDate,
    baseCurrency,
    totalBudgetMinor,
    adultCount,
    childCount,
  };

  return {
    trip,
    days,
    budget,
    packing,
    notes: raw.notes != null && typeof raw.notes === "string" ? cap(raw.notes, 1000) : null,
  };
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isInteger(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function normalizeDay(raw: unknown): AiDayNode {
  if (raw === null || typeof raw !== "object") throw new AiValidationError("Each itinerary day must be an object");
  const day = raw as Record<string, unknown>;
  const dayDate = String(day.dayDate ?? day.date ?? "").trim();
  if (!isIsoDate(dayDate)) throw new AiValidationError(`Invalid itinerary day date: ${dayDate}`);
  const activities = Array.isArray(day.activities) ? day.activities.slice(0, MAX_ACTIVITIES_PER_DAY).map(normalizeActivity) : [];
  if (activities.length === 0) throw new AiValidationError(`Day ${dayDate} must include at least one activity`);
  return { dayDate, theme: day.theme != null ? String(day.theme).trim() || null : null, activities };
}

function normalizeActivity(raw: unknown): AiActivityNode {
  if (raw === null || typeof raw !== "object") throw new AiValidationError("Each activity must be an object");
  const activity = raw as Record<string, unknown>;
  const title = String(activity.title ?? "").trim();
  if (!title) throw new AiValidationError("Each activity requires a title");
  const category = String(activity.category ?? "general").trim().slice(0, 60) || "general";
  const costCurrency = String(activity.currency ?? "USD");
  const estimatedCostMinor =
    activity.estimatedCostMinor != null
      ? toMinorUnits(activity.estimatedCostMinor, costCurrency, "estimatedCost")
      : activity.estimatedCost != null
        ? toMinorUnits(activity.estimatedCost, costCurrency, "estimatedCost")
        : null;
  return {
    title: cap(title, MAX_TITLE),
    description: activity.description != null ? cap(String(activity.description).trim(), MAX_DESCRIPTION) || null : null,
    location: activity.location != null ? cap(String(activity.location).trim(), MAX_TITLE) || null : null,
    category,
    startTime: activity.startTime != null ? String(activity.startTime) : null,
    endTime: activity.endTime != null ? String(activity.endTime) : null,
    estimatedCostMinor,
  };
}

function normalizeBudget(raw: unknown, currency: string, fallbackTotal: MinorUnits | null): AiBudgetNode | null {
  if (raw === null || raw === undefined) return fallbackTotal != null ? { totalMinor: fallbackTotal, items: [] } : null;
  const budget = raw as Record<string, unknown>;
  const totalMinor =
    budget.totalMinor != null
      ? toMinorUnits(budget.totalMinor, currency, "budget total")
      : budget.total != null
        ? toMinorUnits(budget.total, currency, "budget total")
        : fallbackTotal;
  if (totalMinor == null) return null;
  const rawItems = Array.isArray(budget.items) ? budget.items : [];
  const items = rawItems.slice(0, 200).map((item) => normalizeExpense(item, currency));
  return { totalMinor, items };
}

function normalizeExpense(raw: unknown, currency: string): AiExpenseNode {
  if (raw === null || typeof raw !== "object") throw new AiValidationError("Each budget item must be an object");
  const item = raw as Record<string, unknown>;
  const description = String(item.description ?? item.name ?? "").trim();
  if (!description) throw new AiValidationError("Each budget item requires a description");
  const amountMinor =
    item.amountMinor != null
      ? toMinorUnits(item.amountMinor, currency, "budget item amount")
      : item.amount != null
        ? toMinorUnits(item.amount, currency, "budget item amount")
        : null;
  if (amountMinor == null) throw new AiValidationError(`Budget item "${description}" requires an amount`);
  const date = item.date != null ? String(item.date).trim() : null;
  return {
    description: cap(description, MAX_DESCRIPTION),
    amountMinor,
    categoryId: item.categoryId != null ? String(item.categoryId).trim() || null : null,
    date: date && isIsoDate(date) ? date : null,
  };
}

function normalizePacking(raw: unknown): AiPackingNode {
  if (raw === null || typeof raw !== "object") throw new AiValidationError("Each packing item must be an object");
  const item = raw as Record<string, unknown>;
  const name = String(item.name ?? "").trim();
  if (!name) throw new AiValidationError("Each packing item requires a name");
  const category = String(item.category ?? "gear").trim() as AiPackingNode["category"];
  const validCategories = new Set(["clothing", "electronics", "documents", "gear"]);
  const quantity = clampInt(item.quantity, 1, 50, 1);
  return {
    category: validCategories.has(category) ? category : "gear",
    name: cap(name, MAX_TITLE),
    quantity,
    reason: item.reason != null ? cap(String(item.reason).trim(), 120) || null : null,
  };
}

/* ---------------------------------------------------------------------------
 * 2. Offline natural-language fallback parser
 * ------------------------------------------------------------------------- */

interface ParseOptions {
  currency?: string;
  startDate?: string | null;
  adultCount?: number;
  childCount?: number;
}

type Theme = "city" | "beach" | "adventure" | "food" | "culture" | "family";

const THEME_MATCHES: Array<[Theme, RegExp, string]> = [
  ["beach", /\b(beach|coastal|island|tropical|sun|seaside|waterfront)\b/i, "Beach getaway"],
  ["adventure", /\b(hiking|mountains?|trekking|adventure|camping|ski|safari|climbing|outdoor)\b/i, "Adventure trip"],
  ["food", /\b(food|culinary|wine|tasting|gastronomy|cooking|restaurants)\b/i, "Culinary trip"],
  ["culture", /\b(culture|cultural|museum|history|historic|art|heritage|city break)\b/i, "Cultural trip"],
  ["family", /\b(family|kids|children|with children)\b/i, "Family trip"],
];

const ACTIVITY_TEMPLATES: Record<Theme, Array<[string, string, string]>> = {
  city: [
    ["Guided city walking tour", "Wander the main sights with a local guide.", "sightseeing"],
    ["Visit the top landmark", "Explore the city's most famous attraction.", "sightseeing"],
    ["Dinner at a local restaurant", "Taste regional specialties for dinner.", "food"],
  ],
  beach: [
    ["Morning at the beach", "Relax and swim on the shore.", "beach"],
    ["Afternoon water sports", "Snorkeling, paddleboarding, or kayaking.", "outdoors"],
    ["Sunset dinner by the sea", "Enjoy fresh seafood as the sun goes down.", "food"],
  ],
  adventure: [
    ["Morning hike", "A scenic trail with great viewpoints.", "outdoors"],
    ["Afternoon adventure activity", "An adrenaline-pumping excursion.", "outdoors"],
    ["Campfire-style dinner", "A casual, hearty dinner after an active day.", "food"],
  ],
  food: [
    ["Morning food market", "Sample local produce and street food.", "food"],
    ["Cooking class", "Learn to make a regional dish.", "food"],
    ["Dinner tasting menu", "A multi-course meal at a recommended spot.", "food"],
  ],
  culture: [
    ["Museum visit", "Explore the local museum collection.", "culture"],
    ["Historic site tour", "Discover the area's history and architecture.", "culture"],
    ["Evening performance", "A show, concert, or cultural event.", "culture"],
  ],
  family: [
    ["Family-friendly morning", "A relaxed, kid-friendly activity.", "family"],
    ["Afternoon at the park", "Playground time and outdoor fun.", "family"],
    ["Early dinner", "A family-friendly restaurant nearby.", "food"],
  ],
};

function detectTheme(prompt: string): { theme: Theme; label: string } {
  for (const [theme, pattern, label] of THEME_MATCHES) {
    if (pattern.test(prompt)) return { theme, label };
  }
  return { theme: "city", label: "City trip" };
}

function detectDays(prompt: string): number {
  const direct = /(\d+)\s*(?:days?|nights?)\b/i.exec(prompt);
  if (direct) return clampInt(Number(direct[1]), 1, MAX_DAYS, 3);
  if (/\b(a|one)\s*(?:day|night)\b/i.test(prompt)) return 1;
  if (/\b(?:a\s+)?weekend\b/i.test(prompt)) return 2;
  if (/\b(?:a\s+)?week\b/i.test(prompt)) return 7;
  return 3;
}

function detectDestination(prompt: string): string {
  const match = /\b(?:in|to|for|at)\s+([A-Za-z][A-Za-z0-9 .'\-]{1,50})/i.exec(prompt);
  if (!match) return "City";
  let destination = match[1].trim();
  // Cut off trailing clause words that are not part of the destination name.
  const stop = /(\s+(?:on|for|with|budget|this|next|in|at|during|over)\b.*)/i.exec(destination);
  if (stop) destination = destination.slice(0, stop.index);
  destination = destination.replace(/\b(?:days?|nights?|weekend|week|trip)\b/gi, "").trim();
  destination = destination.replace(/[.,]$/, "").trim();
  return destination.slice(0, MAX_DESTINATION) || "City";
}

function detectBudget(prompt: string): { amountMinor: MinorUnits; currency: string } | null {
  const symbolMatch = /([$€£])\s*([\d][\d,]*(?:\.\d+)?)\b/.exec(prompt);
  if (symbolMatch) {
    const symbol = symbolMatch[1];
    const currency = symbol === "$" ? "USD" : symbol === "€" ? "EUR" : "GBP";
    const cleaned = symbolMatch[2].replace(/,/g, "");
    try {
      return { amountMinor: parseMinorUnits(cleaned, currency), currency };
    } catch {
      return null;
    }
  }
  const wordMatch = /([\d][\d,]*(?:\.\d+)?)\s*(dollars|euros|pounds|usd|eur|gbp)\b/i.exec(prompt);
  if (wordMatch) {
    const currencyByWord: Record<string, string> = { dollars: "USD", usd: "USD", euros: "EUR", eur: "EUR", pounds: "GBP", gbp: "GBP" };
    const currency = currencyByWord[wordMatch[2].toLowerCase()] ?? "USD";
    const cleaned = wordMatch[1].replace(/,/g, "");
    try {
      return { amountMinor: parseMinorUnits(cleaned, currency), currency };
    } catch {
      return null;
    }
  }
  return null;
}

function detectTravelers(prompt: string, options: ParseOptions): { adultCount: number; childCount: number } {
  const adult = clampInt(options.adultCount, 1, 99, 1);
  const child = clampInt(options.childCount, 0, 99, 0);
  const group = /\b(?:family|party)\s+of\s*(\d+)\b|\b(\d+)\s*people\b/i.exec(prompt);
  if (group) {
    const count = group[1] ?? group[2];
    const total = clampInt(Number(count), 1, 99, adult + child);
    if (/\bfamily\b/i.test(prompt)) {
      const adults = Math.min(2, total);
      return { adultCount: adults, childCount: Math.max(0, total - adults) };
    }
    return { adultCount: total, childCount: 0 };
  }
  if (/\bsolo\b/i.test(prompt)) return { adultCount: 1, childCount: 0 };
  return { adultCount: adult, childCount: child };
}

/**
 * Parse a natural-language prompt into a valid structured payload using only
 * local rules. Deterministic and offline. A remote model provider can replace
 * this later by returning an `AiItineraryPayload` through `validateAiPayload`.
 */
export function parsePromptToPayload(prompt: string, options: ParseOptions = {}): AiItineraryPayload {
  const trimmed = prompt.trim();
  if (!trimmed) throw new AiValidationError("Enter a prompt to build your trip.");

  const days = detectDays(trimmed);
  const destination = detectDestination(trimmed);
  const detectedBudget = detectBudget(trimmed);
  const baseCurrency = assertCurrency(detectedBudget?.currency ?? options.currency ?? "USD", "currency");
  const { adultCount, childCount } = detectTravelers(trimmed, options);
  const { theme, label } = detectTheme(trimmed);

  const startDateRaw = options.startDate && isIsoDate(options.startDate) ? options.startDate : todayIso();
  const startDate = startDateRaw;
  const endDate = addDays(startDate, days - 1);

  // Build one activity set per day, rotating through the theme's templates.
  const dayNodes: AiDayNode[] = [];
  for (let d = 0; d < days; d++) {
    const dayDate = addDays(startDate, d);
    const template = ACTIVITY_TEMPLATES[theme];
    const activities = template.map(([title, description, category], index) => ({
      title: index === 0 && days > 1 ? `Day ${d + 1}: ${title}` : title,
      description,
      location: destination,
      category,
      startTime: null,
      endTime: null,
      estimatedCostMinor: estimateActivityCost(category, baseCurrency),
    }));
    dayNodes.push({ dayDate, theme: d === 0 ? label : null, activities });
  }

  // Budget: use an explicit prompt budget, else derive from activity estimates.
  const estimatedTotal = dayNodes.reduce(
    (sum, day) => sum + day.activities.reduce((a, b) => a + (b.estimatedCostMinor ?? 0n), 0n),
    0n,
  );
  let budget: AiBudgetNode;
  if (detectedBudget) {
    budget = buildBudget(detectedBudget.amountMinor);
  } else if (estimatedTotal > 0n) {
    budget = buildBudget(estimatedTotal);
  } else {
    budget = { totalMinor: 0n, items: [] };
  }

  const payload = validateAiPayload({
    trip: {
      name: `${destination} Trip`,
      destination,
      description: `A ${days}-day plan for ${destination}.`,
      startDate,
      endDate,
      baseCurrency,
      totalBudget: budget.totalMinor,
      adultCount,
      childCount,
    },
    days: dayNodes,
    budget: {
      total: budget.totalMinor,
      items: budget.items.map((item) => ({ description: item.description, amount: item.amountMinor, date: item.date })),
    },
    packing: buildPacking(dayNodes, days, startDate),
  });
  return payload;
}

/** Rough per-activity planned cost so the finance dashboard has pacing data. */
function estimateActivityCost(category: string, currency: string): MinorUnits | null {
  if (category === "food") return wholeToMinor(60, currency);
  if (category === "sightseeing" || category === "culture") return wholeToMinor(30, currency);
  if (category === "outdoors" || category === "beach") return wholeToMinor(45, currency);
  if (category === "family") return wholeToMinor(35, currency);
  return wholeToMinor(0, currency);
}

/** Split an overall budget into typical travel buckets as planned expense lines. */
function buildBudget(totalMinor: MinorUnits): AiBudgetNode {
  const [lodging, food, activities, transport, misc] = splitMinor(totalMinor, [35, 25, 20, 10, 10]);
  const items: AiExpenseNode[] = [
    { description: "Lodging", amountMinor: lodging, categoryId: "lodging" },
    { description: "Food & dining", amountMinor: food, categoryId: "food" },
    { description: "Activities & tours", amountMinor: activities, categoryId: "activities" },
    { description: "Transport", amountMinor: transport, categoryId: "transport" },
    { description: "Miscellaneous", amountMinor: misc, categoryId: "misc" },
  ];
  return { totalMinor, items };
}

/** Build packing suggestions by delegating to the existing Smart Packing engine. */
function buildPacking(dayNodes: AiDayNode[], durationDays: number, startDate: string): AiPackingNode[] {
  const drafts = generatePackingDrafts({
    durationDays,
    startDate,
    latitude: null,
    activities: dayNodes.flatMap((day) =>
      day.activities.map((activity) => ({
        category: activity.category,
        title: activity.title,
        description: activity.description ?? null,
      })),
    ),
    weatherWarnings: [],
  });
  return drafts.map((draft) => ({
    category: draft.category,
    name: draft.name,
    quantity: draft.quantity,
    reason: draft.reason,
  }));
}

/* ---------------------------------------------------------------------------
 * 3. Builders & ingestion (dependency-injected)
 * ------------------------------------------------------------------------- */

/** Build a `NewTrip` input from a validated payload. */
export function buildNewTrip(payload: AiItineraryPayload, userId: string): NewTrip {
  return {
    id: crypto.randomUUID(),
    ownerId: userId,
    name: payload.trip.name,
    description: payload.trip.description ?? null,
    destination: payload.trip.destination,
    latitude: null,
    longitude: null,
    placeId: null,
    timeZone: null,
    startDate: payload.trip.startDate,
    endDate: payload.trip.endDate,
    coverImageUrl: null,
    adultCount: payload.trip.adultCount,
    childCount: payload.trip.childCount,
    baseCurrency: payload.trip.baseCurrency,
    totalBudgetMinor: payload.trip.totalBudgetMinor,
    isPublic: false,
    shareSlug: null,
    likesCount: 0,
    forkCount: 0,
    authorName: null,
  };
}

/** Build `NewActivity` inputs from a validated payload, ordering each day. */
export function buildActivities(
  payload: AiItineraryPayload,
  context: { tripId: string; createdBy: string; now: string },
): NewActivity[] {
  const activities: NewActivity[] = [];
  payload.days.forEach((day, dayIndex) => {
    day.activities.forEach((activity, index) => {
      activities.push({
        id: crypto.randomUUID(),
        tripId: context.tripId,
        dayDate: day.dayDate,
        title: activity.title,
        description: activity.description ?? null,
        location: activity.location ?? null,
        latitude: null,
        longitude: null,
        category: activity.category || "general",
        startTime: activity.startTime ?? null,
        endTime: activity.endTime ?? null,
        position: dayIndex * 1000 + index + 1,
        estimatedCostMinor: activity.estimatedCostMinor ?? null,
        createdBy: context.createdBy,
      });
    });
  });
  return activities;
}

/** Build `NewExpense` inputs (equal split to the owner) from a payload's budget. */
export function buildExpenses(
  payload: AiItineraryPayload,
  context: { tripId: string; userId: string; currency: string; now: string },
): NewExpense[] {
  if (!payload.budget) return [];
  const date = payload.trip.startDate;
  return payload.budget.items.map((item) => ({
    id: crypto.randomUUID(),
    tripId: context.tripId,
    activityId: null,
    description: item.description,
    amountMinor: item.amountMinor,
    currency: context.currency,
    exchangeRateToBase: null,
    paidBy: context.userId,
    splitType: "equal" as const,
    categoryId: item.categoryId ?? null,
    date: item.date ?? date,
    createdBy: context.userId,
    shares: [
      {
        userId: context.userId,
        shareAmountMinor: item.amountMinor,
        sharePercentage: 100,
        splitType: "equal" as const,
      },
    ],
  }));
}

/** Build `PackingDraft` inputs from a validated payload's packing nodes. */
export function buildPackingDrafts(payload: AiItineraryPayload): PackingDraft[] {
  return payload.packing.map((item) => ({
    category: item.category,
    name: item.name,
    quantity: item.quantity,
    reason: item.reason ?? null,
  }));
}

/** Minimal repository surface the applier depends on (testable with fakes). */
export interface AiApplierDeps {
  trip: Pick<TripRepository, "create" | "update">;
  activity: Pick<ActivityRepository, "create">;
  expense: Pick<ExpenseRepository, "create">;
  packing: Pick<PackingRepository, "applySuggested">;
  newId?: () => string;
  now?: () => string;
}

export interface ApplyAiInput {
  payload: AiItineraryPayload;
  userId: string;
  /** When provided, enhances this trip; otherwise creates a new one. */
  tripId?: string | null;
}

/**
 * Persist a validated payload through the injected repositories. Creates a new
 * trip when `tripId` is omitted (filling dates/budget), otherwise enhances the
 * given trip by adding activities, budget expenses, and packing suggestions.
 */
export async function applyAiPayload(
  input: ApplyAiInput,
  deps: AiApplierDeps,
): Promise<AiApplyResult> {
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const now = deps.now ?? (() => new Date().toISOString());
  const tripId = input.tripId ?? newId();
  const created = !input.tripId;

  if (created) {
    await deps.trip.create(buildNewTrip(input.payload, input.userId));
  } else {
    await deps.trip.update(tripId, {
      startDate: input.payload.trip.startDate,
      endDate: input.payload.trip.endDate,
      totalBudgetMinor: input.payload.trip.totalBudgetMinor,
      ...(input.payload.trip.description ? { description: input.payload.trip.description } : {}),
    });
  }

  const activities = buildActivities(input.payload, { tripId, createdBy: input.userId, now: now() });
  for (const activity of activities) await deps.activity.create(activity);

  const expenses = buildExpenses(input.payload, {
    tripId,
    userId: input.userId,
    currency: input.payload.trip.baseCurrency,
    now: now(),
  });
  for (const expense of expenses) await deps.expense.create(expense);

  await deps.packing.applySuggested(tripId, buildPackingDrafts(input.payload));

  return {
    tripId,
    created,
    counts: { activities: activities.length, expenses: expenses.length, packing: input.payload.packing.length },
  };
}

export type { AiPromptRequest };
