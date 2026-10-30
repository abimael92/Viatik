/**
 * Scout's "best season" arrives as free text such as "dec – apr · dry season".
 * These helpers turn it into month indices so the UI can resolve it to concrete,
 * human-readable dates instead of showing a five-month blob.
 */

function normalizeMonthToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\./g, "")
    .toLowerCase()
    .trim();
}

/** Resolves a localized month token ("dic", "Dec", "diciembre") to its index. */
export function monthIndexFromToken(token: string, locale: string): number | null {
  const wanted = normalizeMonthToken(token);
  if (!wanted) return null;
  for (let month = 0; month < 12; month += 1) {
    const date = new Date(Date.UTC(2026, month, 1));
    const long = new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(date);
    const short = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(date);
    if (normalizeMonthToken(long) === wanted || normalizeMonthToken(short) === wanted) return month;
  }
  return null;
}

/** Full month name in the UI locale, used to spell out abbreviated ranges. */
export function monthName(index: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(2026, index, 1))
  );
}

/** Scout's notes carry the recommended window as a "Best season: …" line. */
export function extractBestSeason(notes: string): string | null {
  const match = notes.match(/^\s*best season:\s*(.+)$/im);
  const season = match?.[1]?.trim();
  return season ? season.slice(0, 120) : null;
}

/** Splits "dec – apr · dry season" into the range and the trailing descriptor. */
export function splitSeason(season: string): { range: string; note: string | null } {
  const [range, ...rest] = season.split("·");
  const note = rest.join("·").trim();
  return { range: (range ?? season).trim() || season, note: note || null };
}

/**
 * Parses "dic – abr" into month indices. The token may be written in either app
 * language, because Scout stores the season in the language it was generated in.
 */
export function parseSeasonMonths(
  range: string,
  locale: string
): { startMonth: number; endMonth: number } | null {
  const match = range.match(/^\s*([^\s–—-]{3,14})\s*[–—-]\s*([^\s–—-]{3,14})\s*$/);
  if (!match) return null;

  const resolve = (token: string) =>
    monthIndexFromToken(token, locale) ??
    monthIndexFromToken(token, "es") ??
    monthIndexFromToken(token, "en");
  const startMonth = resolve(match[1]!);
  const endMonth = resolve(match[2]!);
  return startMonth === null || endMonth === null ? null : { startMonth, endMonth };
}
