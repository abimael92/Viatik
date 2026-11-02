/**
 * The destination pools Scout's deterministic fallback groups destinations by.
 * A wizard chip declares its own category; a typed answer is classified from
 * its words.
 */
export const SCOUT_VIBE_CATEGORIES = ["beach", "city", "nature", "food", "default"] as const;

export type ScoutVibeCategory = (typeof SCOUT_VIBE_CATEGORIES)[number];

/**
 * Maps a free-text vibe to the pool Scout falls back to. Order matters: "good
 * food" wins over "vibrant streets", which is why the wizard chips carry an
 * explicit category instead of being re-classified from their label.
 */
export function selectFallbackCategory(vibe: string): ScoutVibeCategory {
  if (
    /\b(beach|coast|coastal|island|ocean|sea|resort|tropical|sun|surf|water|waterside|shore|seaside)\b/i.test(
      vibe
    )
  ) {
    return "beach";
  }
  if (/\b(nature|mountain|mountains|hike|hiking|forest|park|fresh air|outdoors|outdoor|scenic|lake|trail)\b/i.test(vibe)) {
    return "nature";
  }
  if (/\b(food|foodie|culinary|eat|dining|wine|coffee|cafe|market|ramen|tacos|bakery)\b/i.test(vibe)) {
    return "food";
  }
  if (/\b(city|urban|nightlife|museum|museums|art|architecture|lively|metro|shopping)\b/i.test(vibe)) {
    return "city";
  }
  return "default";
}
