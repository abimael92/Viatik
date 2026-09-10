import type { TripCloneSource } from "@/features/community/lib/duplicate-trip";

/** Editable fields surfaced in the "add from suggestion" dialog. */
export interface SuggestionEdits {
  name: string;
  destination: string | null;
  description: string | null;
  startDate: string; // required yyyy-mm-dd
  endDate: string; // required yyyy-mm-dd
  adultCount: number;
  childCount: number;
  baseCurrency: string;
}

function parseDayKey(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

function toDateKey(day: number): string {
  const date = new Date(day * 86_400_000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/**
 * Builds a cloned trip source from a community template with the user's edits
 * applied. When the start date changes, every activity day and expense date is
 * shifted by the same offset so the itinerary stays coherent on the new dates.
 * The source is never mutated — a fresh object is returned.
 */
export function buildEditedSuggestionSource(
  source: TripCloneSource,
  edits: SuggestionEdits
): TripCloneSource {
  const offsetDays = source.trip.startDate
    ? parseDayKey(edits.startDate) - parseDayKey(source.trip.startDate)
    : 0;

  const shift = (date: string): string => (offsetDays === 0 ? date : toDateKey(parseDayKey(date) + offsetDays));

  const destinationChanged = edits.destination !== source.trip.destination;

  return {
    ...source,
    trip: {
      ...source.trip,
      name: edits.name,
      destination: edits.destination,
      description: edits.description,
      startDate: edits.startDate,
      endDate: edits.endDate,
      adultCount: edits.adultCount,
      childCount: edits.childCount,
      baseCurrency: edits.baseCurrency.toUpperCase(),
      // Drop stale place/geo metadata when the destination is changed.
      placeId: destinationChanged ? null : source.trip.placeId,
      latitude: destinationChanged ? null : source.trip.latitude,
      longitude: destinationChanged ? null : source.trip.longitude,
      timeZone: destinationChanged ? null : source.trip.timeZone,
    },
    activities: source.activities.map((activity) => ({
      ...activity,
      dayDate: shift(activity.dayDate),
    })),
    expenses: source.expenses.map((expense) => ({
      ...expense,
      date: shift(expense.date),
    })),
  };
}
