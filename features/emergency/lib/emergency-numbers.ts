/**
 * Destination-aware local emergency numbers.
 *
 * A static, dependency-free lookup so it works 100% offline. The destination
 * is derived from a trip's free-text `destination` (e.g. "Lisbon, Portugal"):
 * we take the segment after the last comma as the country, then match it (or
 * the full string) against a known map. Unknown destinations fall back to the
 * pan-European 112.
 */

export interface EmergencyNumber {
  /** Dialable digits, e.g. "911". */
  number: string;
  /** Short purpose label, e.g. "Police" / "Medical" / "Fire". */
  label: string;
}

export interface DestinationEmergency {
  /** The country the numbers were resolved for (or null when unknown). */
  country: string | null;
  numbers: EmergencyNumber[];
}

/** Pan-European emergency number, used as the safe default fallback. */
export const DEFAULT_EMERGENCY_NUMBER: EmergencyNumber = {
  number: "112",
  label: "General emergency",
};

/** Build a set of numbers where every service shares one number. */
function common(numbers: string[]): EmergencyNumber[] {
  return numbers.map((number) => ({ number, label: "General emergency" }));
}

/** Best-effort: take the segment after the last comma as the country. */
function extractCountry(destination: string): string {
  const segment = destination.split(",").pop()?.trim();
  return segment ?? destination;
}

/** Countries that can be matched from a destination segment. Keyed by lowercase. */
const COUNTRY_NUMBERS: Record<string, EmergencyNumber[]> = {
  "united states": common(["911"]),
  "united states of america": common(["911"]),
  "usa": common(["911"]),
  "us": common(["911"]),
  "america": common(["911"]),
  "canada": common(["911"]),
  "united kingdom": common(["999", "112"]),
  "uk": common(["999", "112"]),
  "gb": common(["999", "112"]),
  "england": common(["999", "112"]),
  "scotland": common(["999", "112"]),
  "wales": common(["999", "112"]),
  "britain": common(["999", "112"]),
  "ireland": common(["112", "999"]),
  "mexico": common(["911"]),
  "france": common(["112"]),
  "germany": common(["112"]),
  "deutschland": common(["112"]),
  "spain": common(["112"]),
  "espana": common(["112"]),
  "españa": common(["112"]),
  "italy": common(["112"]),
  "portugal": common(["112"]),
  "netherlands": common(["112"]),
  "belgium": common(["112"]),
  "switzerland": common(["112", "144"]),
  "austria": common(["112"]),
  "poland": common(["112"]),
  "sweden": common(["112"]),
  "norway": common(["112"]),
  "denmark": common(["112"]),
  "finland": common(["112"]),
  "greece": common(["112"]),
  "czech republic": common(["112"]),
  "hungary": common(["112"]),
  "romania": common(["112"]),
  "croatia": common(["112"]),
  "japan": [{ number: "110", label: "Police" }, { number: "119", label: "Medical & fire" }],
  "australia": common(["000"]),
  "new zealand": common(["111"]),
  "china": [{ number: "110", label: "Police" }, { number: "120", label: "Medical" }, { number: "119", label: "Fire" }],
  "india": [{ number: "112", label: "General emergency" }, { number: "100", label: "Police" }],
  "brazil": [{ number: "190", label: "Police" }, { number: "192", label: "Medical" }, { number: "193", label: "Fire" }],
  "argentina": [{ number: "911", label: "Police" }, { number: "107", label: "Medical" }, { number: "100", label: "Fire" }],
  "thailand": [{ number: "191", label: "Police" }, { number: "1669", label: "Medical" }],
  "vietnam": [{ number: "113", label: "Police" }, { number: "115", label: "Medical" }, { number: "114", label: "Fire" }],
  "indonesia": [{ number: "112", label: "General emergency" }],
  "singapore": [{ number: "999", label: "Police" }, { number: "995", label: "Medical" }, { number: "995", label: "Fire" }],
  "malaysia": [{ number: "999", label: "General emergency" }],
  "philippines": [{ number: "911", label: "General emergency" }],
  "south korea": common(["112"]),
  "korea": common(["112"]),
  "united arab emirates": common(["999"]),
  "uae": common(["999"]),
  "saudi arabia": common(["911"]),
  "turkey": common(["112"]),
  "egypt": [{ number: "122", label: "Police" }, { number: "123", label: "Medical" }, { number: "180", label: "Fire" }],
  "morocco": [{ number: "19", label: "Police" }, { number: "15", label: "Medical" }, { number: "15", label: "Fire" }],
  "south africa": [{ number: "10111", label: "Police" }, { number: "10177", label: "Medical" }, { number: "112", label: "General emergency" }],
  "kenya": [{ number: "999", label: "General emergency" }, { number: "112", label: "General emergency" }],
};

/**
 * Resolves local emergency numbers for a destination string.
 * Returns the default 112 fallback when no country can be matched.
 */
export function resolveEmergencyNumbers(destination: string | null | undefined): DestinationEmergency {
  const raw = destination?.trim();
  if (!raw) return { country: null, numbers: [DEFAULT_EMERGENCY_NUMBER] };

  const candidates = [raw.toLowerCase(), extractCountry(raw).toLowerCase()];
  for (const key of candidates) {
    const numbers = COUNTRY_NUMBERS[key];
    if (numbers) return { country: extractCountry(raw), numbers };
  }

  return { country: extractCountry(raw) || null, numbers: [DEFAULT_EMERGENCY_NUMBER] };
}

/** Builds a clickable `tel:` URI for a numeric emergency line. */
export function telHref(number: string): string {
  return `tel:${number.replace(/[^\d+]/g, "")}`;
}
