"use client";

import Link from "next/link";
import { ArrowRight, CalendarPlus, Clock } from "lucide-react";

import type { Trip } from "@/features/domain/entities";
import { tripTabPath, type TimelineItem } from "@/features/trips/lib/home-trips";
import { useI18n } from "@/lib/i18n/i18n-provider";

const DAY_ONE_PREVIEW_LIMIT = 3;

/**
 * Preview of the first itinerary stops on the trip's start day, for planned
 * trips on Home. Renders nothing when the trip has no start date; shows an
 * add-activity link when day 1 is still empty.
 */
export function DayOnePreview({ trip, items }: { trip: Trip; items: TimelineItem[] }) {
  const { t } = useI18n();
  if (!trip.startDate) return null;

  const dayOne = items.filter((item) => item.dayDate === trip.startDate).slice(0, DAY_ONE_PREVIEW_LIMIT);
  const itineraryHref = tripTabPath(trip.id, "itinerary");

  return (
    <section aria-labelledby="day-one-preview-heading" className="rounded-2xl border bg-card p-5 text-card-foreground sm:p-6">
      <h2 id="day-one-preview-heading" className="text-base font-semibold">
        {t("copy.dayOnePreviewTitle")}
      </h2>

      {dayOne.length === 0 ? (
        <div className="mt-3">
          <p className="text-sm text-muted-foreground">{t("copy.dayOnePreviewEmpty")}</p>
          <Link
            href={`${itineraryHref}&action=add-activity`}
            className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-lg text-sm font-semibold text-viatik-magenta transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CalendarPlus className="size-4" aria-hidden />
            {t("copy.dayOnePreviewAddActivity")}
          </Link>
        </div>
      ) : (
        <>
          <ul className="mt-4 space-y-3">
            {dayOne.map((item) => (
              <li key={item.id} className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-muted-foreground">
                  <Clock className="size-3.5" aria-hidden />
                  {item.timeLabel ?? t("common.activityAllDay")}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{item.title}</span>
                  {item.location && (
                    <span className="block truncate text-xs text-muted-foreground">{item.location}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <Link
            href={itineraryHref}
            className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-lg text-sm font-semibold text-viatik-magenta transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("copy.viewFullItinerary")}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </>
      )}
    </section>
  );
}
