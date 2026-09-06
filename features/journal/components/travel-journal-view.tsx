"use client";

import { Activity as ActivityIcon, BookOpen, Camera, CircleDollarSign, CalendarDays, Footprints } from "lucide-react";
import { useEffect, useMemo } from "react";

import { Heading } from "@/components/ui/heading";
import type { Activity, Expense } from "@/features/domain/entities";
import type { TripMedia } from "@/features/domain/entities-media";
import { formatMinorUnits, type CurrencyCode } from "@/features/domain/money";
import { useTravelJournal } from "@/features/journal/lib/use-travel-journal";
import type { JournalDay } from "@/features/journal/lib/journal-aggregator";

/**
 * Travel Journal & Trip Replay for a trip. Aggregates photos, activities, and
 * expenses into a chronological, day-by-day story timeline, topped by a
 * prominent end-of-trip statistics card. All data is read from the local-first
 * Dexie layer, so it works fully offline.
 */
export function TravelJournalView({
  tripId,
  baseCurrency,
  startDate,
  endDate,
}: {
  tripId: string;
  baseCurrency: CurrencyCode;
  startDate: string | null;
  endDate: string | null;
}) {
  const { loading, days, summary } = useTravelJournal(tripId, baseCurrency, startDate, endDate);

  return (
    <section aria-labelledby="journal-heading" className="space-y-6">
      <div className="flex items-center gap-2">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <BookOpen className="size-5" />
        </span>
        <div>
          <Heading level={2} id="journal-heading" className="text-xl font-bold">
            Travel Journal
          </Heading>
          <p className="text-sm text-muted-foreground">
            Your trip, day by day — photos, activities, and spending.
          </p>
        </div>
      </div>

      <TripReplayCard summary={summary} baseCurrency={baseCurrency} loading={loading} />

      {loading ? (
        <div className="space-y-4">
          {[0, 1].map((item) => (
            <div key={item} className="h-40 animate-pulse rounded-2xl border bg-card" />
          ))}
        </div>
      ) : days.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <BookOpen className="mx-auto size-8 text-muted-foreground" />
          <Heading level={3} className="mt-3 text-base font-semibold">
            No journal entries yet
          </Heading>
          <p className="mt-1 text-sm text-muted-foreground">
            Add photos, activities, or expenses to start telling your trip’s story.
          </p>
        </div>
      ) : (
        <ol className="relative space-y-6 border-l-2 border-border pl-5">
          {days.map((day) => (
            <li key={day.date} className="relative">
              <span
                aria-hidden
                className="absolute -left-7.25 top-2 grid size-5 place-items-center rounded-full border-2 border-background bg-primary text-primary-foreground"
              >
                <span className="size-1.5 rounded-full bg-current" />
              </span>
              <JournalDayCard day={day} baseCurrency={baseCurrency} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function TripReplayCard({
  summary,
  baseCurrency,
  loading,
}: {
  summary: ReturnType<typeof useTravelJournal>["summary"];
  baseCurrency: CurrencyCode;
  loading: boolean;
}) {
  if (loading) {
    return <div className="h-40 animate-pulse rounded-2xl border bg-card" />;
  }

  const stats = [
    { icon: CalendarDays, label: "Days", value: String(summary.totalDays) },
    { icon: Camera, label: "Photos", value: String(summary.totalPhotos) },
    { icon: Footprints, label: "Activities", value: String(summary.totalActivities) },
    { icon: CircleDollarSign, label: "Spent", value: formatMinorUnits(summary.totalSpentMinor, baseCurrency) },
  ];

  return (
    <div className="relative overflow-hidden rounded-2xl border bg-linear-to-br from-viatik-blue/10 via-viatik-magenta/10 to-transparent p-5 sm:p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 -right-16 z-0 size-52 rounded-full bg-linear-to-br from-viatik-blue/10 to-transparent blur-2xl"
      />
      <div className="relative z-10">
        <div className="flex items-center gap-2">
          <Camera className="size-5 text-primary" aria-hidden />
          <Heading level={3} className="text-lg font-bold">
            Trip Replay
          </Heading>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {summary.totalDays === 1 ? "1 day" : `${summary.totalDays} days`} of {summary.totalPhotos}{" "}
          {summary.totalPhotos === 1 ? "photo" : "photos"} and {summary.totalActivities}{" "}
          {summary.totalActivities === 1 ? "activity" : "activities"} captured so far.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-xl border bg-card/80 p-3">
              <stat.icon className="size-4 text-primary" aria-hidden />
              <p className="mt-2 truncate text-lg font-bold tabular-nums">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function JournalDayCard({ day, baseCurrency }: { day: JournalDay; baseCurrency: CurrencyCode }) {
  const title = formatJournalDate(day.date);

  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="text-sm font-bold">{title}</h3>
        <span className="text-xs text-muted-foreground">{day.date}</span>
        <span className="ml-auto flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {day.photoCount > 0 && (
            <span className="flex items-center gap-1">
              <Camera className="size-3.5" aria-hidden />
              {day.photoCount}
            </span>
          )}
          {day.activityCount > 0 && (
            <span className="flex items-center gap-1">
              <Footprints className="size-3.5" aria-hidden />
              {day.activityCount}
            </span>
          )}
          {day.expenseCount > 0 && (
            <span className="flex items-center gap-1">
              <CircleDollarSign className="size-3.5" aria-hidden />
              {formatMinorUnits(day.totalSpentMinor, baseCurrency)}
            </span>
          )}
        </span>
      </div>

      {day.photos.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {day.photos.slice(0, 8).map((photo) => (
            <PhotoThumb key={photo.id} photo={photo} />
          ))}
        </div>
      )}

      {day.activities.length > 0 && (
        <ul className="mt-3 space-y-2">
          {day.activities.map((activity) => (
            <ActivityRow key={activity.id} activity={activity} />
          ))}
        </ul>
      )}

      {day.expenses.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-border pt-3">
          {day.expenses.map((expense) => (
            <ExpenseRow key={expense.id} expense={expense} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ActivityRow({ activity }: { activity: Activity }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
        <ActivityIcon className="size-3.5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium leading-snug">{activity.title}</p>
        {activity.location && <p className="truncate text-xs text-muted-foreground">{activity.location}</p>}
      </div>
    </li>
  );
}

function ExpenseRow({ expense }: { expense: Expense }) {
  return (
    <li className="flex items-center justify-between gap-3 text-sm">
      <span className="min-w-0 truncate">{expense.description}</span>
      <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-muted-foreground">
        {formatMinorUnits(expense.amountMinor, expense.currency)}
      </span>
    </li>
  );
}

function PhotoThumb({ photo }: { photo: TripMedia }) {
  const objectUrl = useMemo(
    () => photo.uploadedUrl ?? (photo.blob ? URL.createObjectURL(photo.blob) : ""),
    [photo.blob, photo.uploadedUrl]
  );
  useEffect(
    () => () => {
      if (!photo.uploadedUrl && objectUrl) URL.revokeObjectURL(objectUrl);
    },
    [photo.uploadedUrl, objectUrl]
  );

  if (!objectUrl) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={objectUrl}
      alt={photo.caption ?? "Journal photo"}
      className="aspect-square w-full rounded-lg object-cover"
    />
  );
}

function formatJournalDate(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
