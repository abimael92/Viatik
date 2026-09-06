import type { Activity, Expense } from "@/features/domain/entities";
import type { TripMedia } from "@/features/domain/entities-media";
import {
  toBaseMinorUnits,
  type CurrencyCode,
  type MinorUnits,
} from "@/features/domain/money";

/**
 * Travel Journal aggregation engine.
 *
 * Turns a trip's raw activities, expenses, and photos into a chronological,
 * day-by-day story timeline plus an end-of-trip statistics summary. The module
 * is intentionally pure: it accepts plain, Dexie-shaped records and never
 * touches a repository, the database, or React, so it is trivially testable
 * and fully offline.
 *
 * Grouping rules:
 * - Activities are bucketed by their `dayDate`.
 * - Expenses by their `date`.
 * - Photos by their capture date `takenAt`, falling back to `createdAt` when a
 *   capture timestamp is missing, and skipped when neither is available.
 * - Soft-deleted records (`deletedAt !== null`) are excluded everywhere.
 * - Only days that actually contain data are emitted, so an empty trip date
 *   range produces an empty timeline rather than a wall of blank days.
 *
 * Money is handled in minor units (e.g. cents) as integers. Each expense is
 * normalized into the trip's base currency via its `exchangeRateToBase`; an
 * un-convertible foreign expense (no rate, different currency) is skipped so it
 * never corrupts the daily or trip totals.
 */

/** One calendar day on the timeline, `YYYY-MM-DD`. */
export interface JournalDay {
  date: string;
  activities: Activity[];
  expenses: Expense[];
  photos: TripMedia[];
  /** Sum of this day's convertible expenses, in the trip base currency. */
  totalSpentMinor: MinorUnits;
  activityCount: number;
  photoCount: number;
  expenseCount: number;
}

/** End-of-trip statistics shown on the "Trip Replay" summary card. */
export interface TripSummary {
  /** Inclusive number of trip days, falling back to distinct journal days when trip dates are unset. */
  totalDays: number;
  totalActivities: number;
  totalPhotos: number;
  /** Sum of all convertible expenses across the trip, in the trip base currency. */
  totalSpentMinor: MinorUnits;
  startDate: string | null;
  endDate: string | null;
}

/** Converts a minor-units amount into the trip base currency (see module notes). */
function toBase(
  amountMinor: MinorUnits,
  currency: CurrencyCode,
  exchangeRateToBase: number | null,
  baseCurrency: CurrencyCode
): MinorUnits | null {
  if (exchangeRateToBase == null) {
    return currency === baseCurrency ? amountMinor : null;
  }
  return toBaseMinorUnits(amountMinor, currency, exchangeRateToBase, baseCurrency);
}

/** Resolves the calendar date a photo belongs to, or `null` to skip it. */
function mediaDate(media: TripMedia): string | null {
  if (media.deletedAt !== null) return null;
  if (media.takenAt) return media.takenAt;
  if (media.createdAt) return media.createdAt.slice(0, 10);
  return null;
}

/**
 * Groups activities, expenses, and photos by calendar date and returns the
 * days in chronological (ascending) order. Days without any content are not
 * emitted.
 */
export function buildDailyTimeline(
  activities: Activity[],
  expenses: Expense[],
  media: TripMedia[],
  baseCurrency: CurrencyCode
): JournalDay[] {
  const byDate = new Map<string, JournalDay>();

  const ensure = (date: string): JournalDay => {
    let day = byDate.get(date);
    if (!day) {
      day = {
        date,
        activities: [],
        expenses: [],
        photos: [],
        totalSpentMinor: 0n,
        activityCount: 0,
        photoCount: 0,
        expenseCount: 0,
      };
      byDate.set(date, day);
    }
    return day;
  };

  for (const activity of activities) {
    if (activity.deletedAt !== null) continue;
    const day = ensure(activity.dayDate);
    day.activities.push(activity);
    day.activityCount += 1;
  }

  for (const expense of expenses) {
    if (expense.deletedAt !== null) continue;
    const day = ensure(expense.date);
    day.expenses.push(expense);
    day.expenseCount += 1;
    const base = toBase(expense.amountMinor, expense.currency, expense.exchangeRateToBase, baseCurrency);
    if (base != null) day.totalSpentMinor += base;
  }

  for (const item of media) {
    const date = mediaDate(item);
    if (!date) continue;
    const day = ensure(date);
    day.photos.push(item);
    day.photoCount += 1;
  }

  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Inclusive day count for an ISO `yyyy-mm-dd` range, or `null` when invalid. */
export function inclusiveDayCount(
  start: string | null | undefined,
  end: string | null | undefined
): number | null {
  if (!start || !end || end < start) return null;
  const from = new Date(`${start}T00:00:00`).getTime();
  const to = new Date(`${end}T00:00:00`).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.round((to - from) / 86_400_000) + 1;
}

/**
 * Aggregates the daily timeline into a single end-of-trip summary. The trip
 * day count uses the inclusive start→end range when both dates are set; when a
 * range is missing or inverted it falls back to the number of distinct days
 * that actually have content.
 */
export function computeTripSummary(
  days: JournalDay[],
  tripDates: { startDate: string | null; endDate: string | null }
): TripSummary {
  const totalActivities = days.reduce((sum, day) => sum + day.activityCount, 0);
  const totalPhotos = days.reduce((sum, day) => sum + day.photoCount, 0);
  const totalSpentMinor = days.reduce((sum, day) => sum + day.totalSpentMinor, 0n);

  const rangeDays = inclusiveDayCount(tripDates.startDate, tripDates.endDate);

  return {
    totalDays: rangeDays ?? days.length,
    totalActivities,
    totalPhotos,
    totalSpentMinor,
    startDate: tripDates.startDate,
    endDate: tripDates.endDate,
  };
}
