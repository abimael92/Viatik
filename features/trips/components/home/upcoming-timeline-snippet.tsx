"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Clock3 } from "lucide-react";

import type { Trip } from "@/features/domain/entities";
import type { TimelineItem } from "@/features/trips/lib/home-trips";
import { getTripCoverGradient, isTripCoverImage } from "@/features/trips/lib/trip-cover";
import { tripTabPath } from "@/features/trips/lib/home-trips";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/i18n-provider";

/**
 * Compact timeline feed. For an active trip it shows today's schedule; for an
 * upcoming trip it previews the next few activities, with a link into the full
 * itinerary.
 */
export function UpcomingTimelineSnippet({
  trip,
  items,
  active,
}: {
  trip: Trip;
  items: TimelineItem[];
  active: boolean;
}) {
  const { t } = useI18n();

  const coverUrl = isTripCoverImage(trip.coverImageUrl) ? trip.coverImageUrl : null;
  const gradient = getTripCoverGradient(trip.coverImageUrl);
  const label = trip.destination ?? trip.name;
  return (
    <section className="rounded-2xl border bg-card p-5" aria-label={active ? "Today at a glance" : "Upcoming itinerary"}>
      {coverUrl ? (
        <div className="relative -m-5 mb-4 h-28 overflow-hidden rounded-t-2xl">
          <Image src={coverUrl} alt={label} fill sizes="(max-width: 768px) 100vw, 50vw" unoptimized className="object-cover" />
          <div className="absolute inset-0 bg-linear-to-t from-black/60 to-transparent" />
          <p className="absolute bottom-2 left-4 text-lg font-bold text-white drop-shadow">{label}</p>
        </div>
      ) : gradient ? (
        <div className={cn("-m-5 mb-4 flex h-24 items-end rounded-t-2xl px-4 pb-2", gradient.className)}>
          <p className="text-lg font-bold text-white drop-shadow">{label}</p>
        </div>
      ) : (
        <div className="-m-5 mb-4 flex h-20 items-end rounded-t-2xl bg-muted px-4 pb-2">
          <p className="text-lg font-bold text-foreground">{label}</p>
        </div>
      )}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">
          {active ? "Today at a glance" : `Up next in ${trip.destination ?? trip.name}`}
        </h2>
        <Link
          href={tripTabPath(trip.id, "itinerary")}
          className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
        >
          {t("common.itinerary")} <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          {active ? "Nothing scheduled today — enjoy a slow morning." : "No activities planned yet."}
        </p>
      ) : (
        <ol className="mt-4 space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/60 p-3"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <Clock3 className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{item.title}</span>
                {item.location && <span className="block truncate text-xs text-muted-foreground">{item.location}</span>}
              </span>
              {item.timeLabel && (
                <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">{item.timeLabel}</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
