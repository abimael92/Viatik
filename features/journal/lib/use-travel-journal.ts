"use client";

import { useEffect, useMemo, useState } from "react";

import { activityRepository } from "@/features/activities/data/dexie-activity-repository";
import type { Activity, Expense } from "@/features/domain/entities";
import type { TripMedia } from "@/features/domain/entities-media";
import type { CurrencyCode } from "@/features/domain/money";
import { expenseRepository } from "@/features/expenses/data/dexie-expense-repository";
import { mediaRepository } from "@/features/media/data/dexie-media-repository";
import {
  buildDailyTimeline,
  computeTripSummary,
  type JournalDay,
  type TripSummary,
} from "@/features/journal/lib/journal-aggregator";

export interface TravelJournalData {
  /** True while any of the feeds (activities, expenses, media) are still loading. */
  loading: boolean;
  /** Day-by-day story timeline in chronological order. */
  days: JournalDay[];
  /** End-of-trip statistics for the "Trip Replay" summary card. */
  summary: TripSummary;
}

/**
 * Feeds the travel journal entirely from the local-first Dexie layer: trip
 * activities, expenses, and photos each arrive via a live query so the timeline
 * stays reactive and fully offline. No network reads occur at render time.
 */
export function useTravelJournal(
  tripId: string,
  baseCurrency: CurrencyCode,
  startDate: string | null,
  endDate: string | null
): TravelJournalData {
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [media, setMedia] = useState<TripMedia[] | null>(null);

  useEffect(() => activityRepository.watchByTrip(tripId, setActivities), [tripId]);
  useEffect(() => expenseRepository.watchByTrip(tripId, setExpenses), [tripId]);
  useEffect(() => mediaRepository.watchByTrip(tripId, null, setMedia), [tripId]);

  const days = useMemo(
    () => buildDailyTimeline(activities ?? [], expenses ?? [], media ?? [], baseCurrency),
    [activities, expenses, media, baseCurrency]
  );

  const summary = useMemo(
    () => computeTripSummary(days, { startDate, endDate }),
    [days, startDate, endDate]
  );

  return {
    loading: activities === null || expenses === null || media === null,
    days,
    summary,
  };
}
