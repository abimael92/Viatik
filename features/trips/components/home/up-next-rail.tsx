"use client";

import Link from "next/link";
import { CalendarDays, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import type { Trip } from "@/features/domain/entities";
import { formatCountdown, tripTabPath } from "@/features/trips/lib/home-trips";
import { cn } from "@/lib/utils";

/**
 * Compact "Up Next" rail shown on Home only when the hero trip is planned.
 * Surfaces the other planned trips that start today or later.
 */
export function UpNextRail({ trips, today }: { trips: Trip[]; today: Date }) {
  if (trips.length === 0) return null;

  return (
    <section className="rounded-2xl border bg-card p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <Heading level={2} className="text-base font-semibold">
          Up next
        </Heading>
        <Button asChild variant="ghost" size="sm">
          <Link href="/trips">View all trips</Link>
        </Button>
      </div>
      <div className={cn("mt-4 grid gap-3", trips.length === 1 ? "grid-cols-1" : trips.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3")}>
        {trips.map((trip) => (
          <Link
            key={trip.id}
            href={tripTabPath(trip.id, "overview")}
            className="group rounded-xl border bg-card p-4 transition hover:border-foreground/20"
          >
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-viatik-magenta">
              <CalendarDays className="size-3.5" aria-hidden />
              {formatCountdown(trip.startDate ?? "", today)}
            </p>
            <p className="mt-2 line-clamp-1 font-semibold">{trip.destination ?? trip.name}</p>
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{trip.name}</span>
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
