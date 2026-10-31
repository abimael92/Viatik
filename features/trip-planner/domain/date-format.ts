import { parseISO } from "date-fns";

/**
 * Date labels for trip surfaces. Months are always capitalized, including in
 * Spanish, because the card reads as a label rather than running prose.
 */

export function capitalize(value: string): string {
  return value.charAt(0).toLocaleUpperCase() + value.slice(1);
}

function monthShort(date: Date, locale: string): string {
  const label = new Intl.DateTimeFormat(locale, {
    month: "short",
    timeZone: "UTC",
  })
    .format(date)
    .replace(/\.$/, "");
  return capitalize(label);
}

function dayNumber(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: "numeric", timeZone: "UTC" }).format(date);
}

function yearNumber(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { year: "numeric", timeZone: "UTC" }).format(date);
}

/** "29 Oct 2027" */
export function formatTripDay(date: Date, locale: string): string {
  return `${dayNumber(date, locale)} ${monthShort(date, locale)} ${yearNumber(date, locale)}`;
}

/** Same as `formatTripDay` but from an ISO `YYYY-MM-DD` string. */
export function formatIsoTripDay(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return formatTripDay(new Date(Date.UTC(year, month - 1, day)), locale);
}

/** "1 – 4 Dic 2026", "28 Dic 2026 – 2 Ene 2027" */
export function formatTripRange(startIso: string, endIso: string, locale: string): string {
  const start = parseISO(startIso);
  const end = parseISO(endIso);

  const sameMonth =
    start.getUTCFullYear() === end.getUTCFullYear() &&
    start.getUTCMonth() === end.getUTCMonth();
  if (sameMonth) {
    return `${dayNumber(start, locale)} – ${formatTripDay(end, locale)}`;
  }
  if (start.getUTCFullYear() === end.getUTCFullYear()) {
    return `${dayNumber(start, locale)} ${monthShort(start, locale)} – ${formatTripDay(end, locale)}`;
  }
  return `${formatTripDay(start, locale)} – ${formatTripDay(end, locale)}`;
}
