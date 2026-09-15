/**
 * Smart Packing List generator.
 *
 * A pure, rule-based engine that turns trip context (duration, season/climate,
 * scheduled activities, and weather warnings) into categorized packing
 * suggestions. Kept side-effect free so it is trivial to unit test; the
 * repository is responsible for persisting and reconciling the resulting
 * drafts against the user's existing checklist.
 */

import type { PackingCategory, PackingDraft, PackingGenerationInput } from "@/features/packing/domain/packing-types";

type DraftTuple = [PackingCategory, string, number, string | null];

/** Broad temperature band inferred from latitude + hemisphere-aware season. */
export type TemperatureProfile = "cold" | "mild" | "hot";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function dedupe(drafts: DraftTuple[]): PackingDraft[] {
  const seen = new Set<string>();
  const out: PackingDraft[] = [];
  for (const [category, name, quantity, reason] of drafts) {
    const key = `${category}:${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ category, name, quantity, reason });
  }
  return out;
}

/** Nightly count of the trip from its date range (0 when unknown). */
export function tripDurationDays(startDate: string | null, endDate: string | null): number | null {
  if (!startDate || !endDate) return null;
  const start = new Date(`${startDate}T12:00:00`).getTime();
  const end = new Date(`${endDate}T12:00:00`).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  return Math.round((end - start) / (1000 * 60 * 60 * 24));
}

/**
 * Infer a coarse climate band from latitude and the trip's start month.
 * Uses a simple hemisphere-aware heuristic rather than a geocoding service so
 * the generator stays offline and deterministic.
 */
export function inferTemperatureProfile(latitude: number | null, startDate: string | null): TemperatureProfile {
  if (latitude == null) return "mild";
  const month = startDate ? new Date(`${startDate}T12:00:00`).getMonth() : -1;
  const monthValid = !Number.isNaN(month) && month >= 0;
  const isNorthern = latitude >= 0;
  // Map a calendar month to a northern-hemisphere season: winter ~ Dec-Feb (11,0,1),
  // summer ~ Jun-Aug (5,6,7).
  const seasonIsSummer = monthValid && (month >= 5 && month <= 7);
  const seasonIsWinter = monthValid && (month === 11 || month <= 1);
  const absLat = Math.abs(latitude);

  if (absLat > 60) return "cold";
  if (absLat >= 40) {
    // Poleward of 40°: season matters (summer is mild, winter is cold).
    const summerHere = isNorthern ? seasonIsSummer : !seasonIsSummer;
    const winterHere = isNorthern ? seasonIsWinter : !seasonIsWinter;
    if (winterHere) return "cold";
    if (summerHere) return "mild";
    return "mild";
  }
  // Between the tropics and 40°: generally warm; hot near the equator.
  if (absLat < 23.5) return "hot";
  return "mild";
}

const ACTIVITY_GEAR_RULES: Array<{ match: RegExp; items: DraftTuple[] }> = [
  {
    match: /hiking|trekking|trail|mountain|camping|outdoor|adventure/i,
    items: [
      ["gear", "Hiking shoes", 1, "activity"],
      ["gear", "Daypack", 1, "activity"],
      ["gear", "Water bottle", 1, "activity"],
    ],
  },
  {
    match: /beach|swim|pool|water|diving|snorkel/i,
    items: [
      ["clothing", "Swimwear", 1, "activity"],
      ["gear", "Beach towel", 1, "activity"],
    ],
  },
  {
    match: /nightlife|formal|dinner|gala|wedding/i,
    items: [["clothing", "A nicer outfit", 1, "activity"]],
  },
  {
    match: /sightseeing|city|walk|tour|culture|museum/i,
    items: [["clothing", "Comfortable walking shoes", 1, "activity"]],
  },
  {
    match: /sport|gym|run|cycling|bike/i,
    items: [["gear", "Sports gear", 1, "activity"]],
  },
];

function activityMatches(category: string, title: string, description: string | null): string {
  return `${category} ${title} ${description ?? ""}`;
}

function gearFromActivities(activities: PackingGenerationInput["activities"]): DraftTuple[] {
  const out: DraftTuple[] = [];
  for (const activity of activities) {
    const haystack = activityMatches(activity.category, activity.title, activity.description ?? null);
    for (const rule of ACTIVITY_GEAR_RULES) {
      if (rule.match.test(haystack)) out.push(...rule.items);
    }
  }
  return out;
}

/**
 * Generate a categorized packing checklist from trip context.
 *
 * Always includes travel documents and essentials, scales clothing with trip
 * length, biases clothing toward the inferred climate, reacts to weather
 * warnings, and adds gear for matching scheduled activities.
 */
export function generatePackingDrafts(input: PackingGenerationInput): PackingDraft[] {
  const drafts: DraftTuple[] = [];

  // Documents & essentials — always present.
  drafts.push(["documents", "Passport / ID", 1, "always"]);
  drafts.push(["documents", "Travel insurance", 1, "always"]);
  drafts.push(["documents", "Booking confirmations", 1, "always"]);
  drafts.push(["electronics", "Phone charger", 1, "always"]);
  drafts.push(["electronics", "Portable battery", 1, "always"]);

  // Clothing scales with trip length.
  const days = input.durationDays;
  if (days != null) {
    drafts.push(["clothing", "Underwear", clamp(days + 1, 2, 7), "duration"]);
    drafts.push(["clothing", "Socks", clamp(days + 1, 2, 6), "duration"]);
    drafts.push(["clothing", "Shirts / tops", clamp(days + 1, 2, 5), "duration"]);
    drafts.push(["clothing", "Pants / bottoms", clamp(Math.ceil(days / 2), 1, 3), "duration"]);
    drafts.push(["clothing", "Sleepwear", 1, "duration"]);
  }

  // Climate band drives seasonal clothing.
  const profile = inferTemperatureProfile(input.latitude, input.startDate);
  if (profile === "cold") {
    drafts.push(["clothing", "Heavy jacket / coat", 1, "climate"]);
    drafts.push(["clothing", "Warm layers", 2, "climate"]);
    drafts.push(["clothing", "Gloves", 1, "climate"]);
    drafts.push(["clothing", "Beanie / hat", 1, "climate"]);
  } else if (profile === "hot") {
    drafts.push(["clothing", "Sunscreen", 1, "climate"]);
    drafts.push(["clothing", "Sun hat", 1, "climate"]);
    drafts.push(["clothing", "Light, breathable clothes", clamp(days != null ? days + 1 : 3, 3, 6), "climate"]);
    drafts.push(["clothing", "Swimwear", 1, "climate"]);
  } else {
    drafts.push(["clothing", "Light jacket", 1, "climate"]);
    drafts.push(["clothing", "Comfortable shoes", 1, "climate"]);
  }

  // Weather warnings can push additional rain/cold protection.
  for (const warning of input.weatherWarnings ?? []) {
    if (warning.type === "heavyRain") {
      drafts.push(["gear", "Rain jacket", 1, "weather"]);
      drafts.push(["gear", "Umbrella", 1, "weather"]);
    } else if (warning.type === "freezing") {
      drafts.push(["clothing", "Thermal top", 1, "weather"]);
      drafts.push(["clothing", "Warm scarf", 1, "weather"]);
    } else if (warning.type === "extremeHeat") {
      drafts.push(["clothing", "Sunscreen", 1, "weather"]);
      drafts.push(["gear", "Reusable water bottle", 1, "weather"]);
    }
  }

  // Scheduled activities add purpose-built gear.
  drafts.push(...gearFromActivities(input.activities));

  return dedupe(drafts);
}
