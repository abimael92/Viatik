/**
 * Structured prompt builder for the "Scout Activities" flow.
 *
 * Unlike the older free-text scout, this constructs a single, well-scoped
 * instruction from the trip's exact destination and date range so the LLM
 * returns diverse, seasonally-aware recommendations as parseable JSON.
 */

export const SCOUT_ACTIVITIES_INSTRUCTION =
  "Act as an autonomous local guide. For destination [Destination] during [Dates], generate 8–10 diverse, high-value activity recommendations. Factor in seasonal events happening on those exact dates. For each recommendation, output: title, rich description, cost tier ($ to $$$$), time spent tier (Quick Hit / Half-Session / Deep Dive), specific activity category tag (Photo Op, Bar & Nightlife, Physical/Active, Shopping, Gastronomy, Culture), and a practical transit/logistics note. Return clean, parseable JSON.";

/**
 * Build the full scout prompt by substituting the destination and a
 * human-readable date range into {@link SCOUT_ACTIVITIES_INSTRUCTION}.
 */
export function buildScoutPrompt(destination: string, dates: string): string {
  return SCOUT_ACTIVITIES_INSTRUCTION
    .replace("[Destination]", destination.trim() || "your destination")
    .replace("[Dates]", dates.trim() || "your trip dates");
}

/** Format a single ISO day as e.g. "Sep 6, 2026". */
export function formatScoutDay(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Build a compact human-readable date range from an ordered list of ISO day
 * dates, e.g. "Sep 6 – Sep 12, 2026". A single day yields just that day.
 * Returns an empty string when `days` is empty.
 */
export function buildTripDates(days: string[]): string {
  if (days.length === 0) return "";
  const first = days[0];
  const last = days[days.length - 1];
  if (first === last) return formatScoutDay(first);
  const start = new Date(`${first}T12:00:00`);
  const end = new Date(`${last}T12:00:00`);
  const startLabel = start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(start.getFullYear() === end.getFullYear() ? {} : { year: "numeric" }),
  });
  return `${startLabel} – ${formatScoutDay(last)}`;
}
