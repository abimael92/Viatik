import type { TransitMode } from "@/features/transit/domain/transit-types";

export interface ParsedTicket {
  mode?: TransitMode;
  carrier?: string;
  carrierCode?: string;
  number?: string;
  origin?: string;
  destination?: string;
  dayDate?: string;
  departureTime?: string;
  arrivalTime?: string;
  station?: string;
}

function normalizedTime(hour: string, minute: string, meridiem?: string): string {
  let value = Number(hour);
  if (meridiem?.toUpperCase() === "PM" && value < 12) value += 12;
  if (meridiem?.toUpperCase() === "AM" && value === 12) value = 0;
  return `${String(value).padStart(2, "0")}:${minute}`;
}

function normalizedDate(raw: string): string | undefined {
  const parts = raw.split(/[\/.\-]/).map(Number);
  if (parts.length !== 3) return undefined;
  const [first, second, third] = parts;
  const [year, month, day] = first > 1900 ? [first, second, third] : [third < 100 ? 2000 + third : third, first, second];
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return undefined;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseTicketText(text: string): ParsedTicket {
  const clean = text.replace(/\r/g, "").replace(/[ \t]+/g, " ");
  const upper = clean.toUpperCase();
  const result: ParsedTicket = {};
  if (/\b(TRAIN|RAIL|AMTRAK)\b/.test(upper)) result.mode = "train";
  else if (/\b(FLIGHT|AIRLINES?|AIRWAYS|BOARDING PASS)\b/.test(upper)) result.mode = "flight";

  const flight = upper.match(/\b(?:FLIGHT|FLT|TRAIN)?\s*([A-Z]{2,3})\s*[- ]?\s*(\d{1,5})\b/);
  if (flight) {
    result.carrierCode = flight[1];
    result.number = flight[2];
  }

  const route = upper.match(/\b([A-Z]{3})\s*(?:→|->|TO|–|-)\s*([A-Z]{3})\b/);
  if (route) [result.origin, result.destination] = [route[1], route[2]];
  else {
    const airportCodes = [...upper.matchAll(/\b[A-Z]{3}\b/g)].map((match) => match[0]).filter((code) => !["THE", "AND", "GATE", "SEAT", "FROM"].includes(code));
    if (airportCodes.length >= 2) [result.origin, result.destination] = airportCodes.slice(0, 2);
  }

  const date = clean.match(/\b(\d{4}[\/.\-]\d{1,2}[\/.\-]\d{1,2}|\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})\b/);
  if (date) result.dayDate = normalizedDate(date[1]);

  const times = [...clean.matchAll(/\b(\d{1,2}):(\d{2})\s*(AM|PM)?\b/gi)];
  if (times[0]) result.departureTime = normalizedTime(times[0][1], times[0][2], times[0][3]);
  if (times[1]) result.arrivalTime = normalizedTime(times[1][1], times[1][2], times[1][3]);

  const station = upper.match(/\b(?:GATE|PLATFORM|TERMINAL)\s*[:#-]?\s*([A-Z0-9-]{1,6})\b/);
  if (station) result.station = station[1];
  const carrier = clean.match(/(?:^|\n)\s*([A-Za-z][A-Za-z &]{2,30}(?:Airlines|Airways|Rail|Trains?))\b/i);
  if (carrier) result.carrier = carrier[1].trim();
  return result;
}
