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

/**
 * Airbnb expects a hyphenated location slug in the path (`Kyoto--Japan`).
 * Percent-encoding the comma instead leaves a literal `Kyoto%2C Japan` in the
 * page header, so punctuation is stripped and spaces become `--`.
 */
function airbnbSlug(destination: string): string {
  const words = destination
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words.length > 0 ? words.join("--") : destination.trim();
}

/**
 * Outbound Airbnb search for a destination. Dates and guest counts are
 * optional; when supplied the dates must be `yyyy-MM-dd`. The destination text
 * is the only user data sent, and it is disclosed in the UI before navigation.
 */
export function buildAirbnbSearchUrl({
  destination,
  checkIn = null,
  checkOut = null,
  adults = null,
}: {
  destination: string;
  checkIn?: string | null;
  checkOut?: string | null;
  adults?: number | null;
}): string {
  const place = requiredText(destination, "Destination");
  if (!isDateOnly(checkIn)) throw new Error("Enter a valid check-in date.");
  if (!isDateOnly(checkOut)) throw new Error("Enter a valid check-out date.");
  if (adults != null && (!Number.isInteger(adults) || adults < 1 || adults > 20)) {
    throw new Error("Enter between 1 and 20 guests.");
  }

  const url = new URL(`/s/${encodeURIComponent(airbnbSlug(place))}/homes`, "https://www.airbnb.com");
  if (checkIn) url.searchParams.set("checkin", checkIn);
  if (checkOut) url.searchParams.set("checkout", checkOut);
  if (adults) url.searchParams.set("adults", String(adults));
  return url.toString();
}
