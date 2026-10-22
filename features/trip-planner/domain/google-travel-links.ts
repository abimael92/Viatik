import { isValid, parseISO } from "date-fns";

function requiredText(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} is required.`);
  if (normalized.length > 120) throw new Error(`${name} is too long.`);
  return normalized;
}

function isDateOnly(value: string | null): boolean {
  return value == null || (/^\d{4}-\d{2}-\d{2}$/.test(value) && isValid(parseISO(value)));
}

function buildUrl(path: string, query: string, extra: Record<string, string> = {}): string {
  const url = new URL(path, "https://www.google.com");
  url.searchParams.set("q", query);
  for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, value);
  return url.toString();
}

/**
 * Builds a Google Flights search that carries the traveler's actual criteria —
 * route, dates, passenger count, and a nonstop preference — so the provider
 * opens pre-filtered instead of at a generic landing page.
 *
 * Google parses the free-text `q` parameter as a search-box query, and two
 * things silently drop the whole search to the marketing homepage:
 *
 * 1. Word order — `Flights from A to B on D through D` populates the form,
 *    while `Flights to B from A …` does not.
 * 2. Locale-sensitive words — appending an English cabin phrase such as
 *    `economy class` breaks the parse when `hl` is not English. Cabin is not
 *    encoded here: Google Flights already opens on Economy, and the UI states
 *    that. With no origin, Google starts from the viewer's location.
 */
export function buildGoogleFlightsUrl({
  origin,
  destination,
  startDate,
  returnDate = null,
  passengers = null,
  nonstopOnly = false,
  currency = null,
  locale = null,
}: {
  origin: string;
  destination: string;
  startDate: string | null;
  returnDate?: string | null;
  passengers?: number | null;
  nonstopOnly?: boolean;
  currency?: string | null;
  locale?: string | null;
}): string {
  const to = requiredText(destination, "Destination");
  const from = origin.trim();
  if (from.length > 120) throw new Error("Origin is too long.");
  if (!isDateOnly(startDate)) throw new Error("Enter a valid departure date.");
  if (!isDateOnly(returnDate)) throw new Error("Enter a valid return date.");
  if (passengers != null && (!Number.isInteger(passengers) || passengers < 1 || passengers > 20)) {
    throw new Error("Enter between 1 and 20 travelers.");
  }

  const query = [
    from ? `Flights from ${from} to ${to}` : `Flights to ${to}`,
    startDate ? `on ${startDate}` : null,
    returnDate ? `through ${returnDate}` : null,
    nonstopOnly ? "nonstop" : null,
    passengers ? `${passengers} passengers` : null,
  ]
    .filter(Boolean)
    .join(" ");

  const extra: Record<string, string> = {};
  if (currency) extra.curr = currency.toUpperCase();
  if (locale) extra.hl = locale;

  return buildUrl("/travel/flights", query, extra);
}

export function buildGoogleHotelsUrl(destination: string): string {
  return buildUrl("/travel/hotels", `Hotels in ${requiredText(destination, "Destination")}`);
}
