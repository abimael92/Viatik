export const MAX_TRIP_DAYS = 60;

function parseDateParts(date: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function toUtcNoon(date: string): number | null {
  const parts = parseDateParts(date);
  if (!parts) return null;
  const timestamp = Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0);
  const resolved = new Date(timestamp);
  if (resolved.getUTCFullYear() !== parts.year || resolved.getUTCMonth() !== parts.month - 1 || resolved.getUTCDate() !== parts.day) {
    return null;
  }
  return timestamp;
}

export function countTripDays(startDate: string | null | undefined, endDate: string | null | undefined): number | null {
  if (!startDate || !endDate) return null;
  const start = toUtcNoon(startDate);
  const end = toUtcNoon(endDate);
  if (start === null || end === null) return null;
  if (end < start) return null;
  return Math.floor((end - start) / 86_400_000) + 1;
}

export function getMaxEndDate(startDate: string | null | undefined): string | null {
  if (!startDate) return null;
  const start = toUtcNoon(startDate);
  if (start === null) return null;
  const max = new Date(start + MAX_TRIP_DAYS * 86_400_000 - 86_400_000);
  return `${max.getUTCFullYear()}-${String(max.getUTCMonth() + 1).padStart(2, "0")}-${String(max.getUTCDate()).padStart(2, "0")}`;
}

export function getTripDurationError(startDate: string | null | undefined, endDate: string | null | undefined): string | null {
  if (!startDate || !endDate) return null;
  const start = toUtcNoon(startDate);
  const end = toUtcNoon(endDate);
  if (start === null || end === null) return "Enter valid dates.";
  if (end < start) return "End date must be on or after the start date.";
  const days = Math.floor((end - start) / 86_400_000) + 1;
  if (days > MAX_TRIP_DAYS) return `Trips can be up to ${MAX_TRIP_DAYS} days long. This trip is ${days} days.`;
  return null;
}

export function assertValidTripDates(startDate: string | null | undefined, endDate: string | null | undefined): void {
  const error = getTripDurationError(startDate, endDate);
  if (error) throw new Error(error);
}
