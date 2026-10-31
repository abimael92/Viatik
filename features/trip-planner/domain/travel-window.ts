import { formatTripRange } from "@/features/trip-planner/domain/date-format";

/**
 * A trip is planned as a short window, never as a season-long blob. Anything
 * longer is clamped by the schedule builders instead of being shown.
 */
export const MAX_TRAVEL_WINDOW_DAYS = 30;

export type TravelWindow = { start: string; end: string };

/** "1 – 4 Dic 2026" for one month, "28 Dic 2026 – 2 Ene 2027" across months. */
export function formatTravelWindow(window: TravelWindow, locale: string): string {
  return formatTripRange(window.start, window.end, locale);
}
