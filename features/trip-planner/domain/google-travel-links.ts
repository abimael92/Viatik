import { isValid, parseISO } from "date-fns";

function requiredText(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} is required.`);
  if (normalized.length > 120) throw new Error(`${name} is too long.`);
  return normalized;
}

function buildUrl(path: string, query: string): string {
  const url = new URL(path, "https://www.google.com");
  url.searchParams.set("q", query);
  return url.toString();
}

export function buildGoogleFlightsUrl({
  origin,
  destination,
  startDate,
}: {
  origin: string;
  destination: string;
  startDate: string | null;
}): string {
  const to = requiredText(destination, "Destination");
  const from = origin.trim();
  if (from.length > 120) throw new Error("Origin is too long.");
  if (startDate && (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !isValid(parseISO(startDate)))) {
    throw new Error("Enter a valid departure date.");
  }

  const query = [
    `Flights to ${to}`,
    from ? `from ${from}` : null,
    startDate ? `on ${startDate}` : null,
  ]
    .filter(Boolean)
    .join(" ");
  return buildUrl("/travel/flights", query);
}

export function buildGoogleHotelsUrl(destination: string): string {
  return buildUrl("/travel/hotels", `Hotels in ${requiredText(destination, "Destination")}`);
}
