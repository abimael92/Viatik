"use client";

import Link from "next/link";
import { ArrowRight, Clock3 } from "lucide-react";

import type { Trip } from "@/features/domain/entities";
import type { TimelineItem } from "@/features/trips/lib/home-trips";
import { tripTabPath } from "@/features/trips/lib/home-trips";

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
  return (
    <section className="rounded-2xl border bg-card p-5" aria-label={active ? "Today at a glance" : "Upcoming itinerary"}>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">
          {active ? "Today at a glance" : `Up next in ${trip.destination ?? trip.name}`}
        </h2>
        <Link
          href={tripTabPath(trip.id, "itinerary")}
          className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
        >
          Itinerary <ArrowRight className="size-4" aria-hidden />
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
