"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Trip } from "@/features/domain/entities";
import type { ReadinessItem } from "@/features/trips/lib/readiness";
import { formatCountdown, tripTabPath } from "@/features/trips/lib/home-trips";

/**
 * Immersive "next trip" hero: a destination countdown plus a context-sensitive
 * CTA that jumps straight to whatever trip data is still missing.
 */
export function TripCountdownHero({
  trip,
  today,
  nextAction,
}: {
  trip: Trip;
  today: Date;
  nextAction: ReadinessItem | null;
}) {
  const countdown = formatCountdown(trip.startDate ?? "", today);
  const destination = trip.destination ?? trip.name;
  const cta = nextAction ?? {
    key: "overview",
    label: "Open trip",
    action: "Open trip",
    hint: "View this trip's overview.",
    status: "complete" as const,
    targetTab: "overview" as const,
  };

  return (
    <section
      className="relative overflow-hidden rounded-[1.75rem] border bg-card p-6 text-foreground shadow-sm sm:p-8"
      aria-label="Next trip"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_20%,color-mix(in_oklch,var(--viatik-magenta)_22%,transparent),transparent_36%),radial-gradient(circle_at_88%_10%,color-mix(in_oklch,var(--viatik-blue)_16%,transparent),transparent_30%)]"
      />
      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-viatik-magenta">
            <CalendarDays className="size-4" aria-hidden />
            {countdown}
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{destination}</h1>
          <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{trip.name}</span>
          </p>
        </div>

        <div className="shrink-0">
          <Button asChild variant="primary" size="lg" className="w-full sm:w-auto">
            <Link href={tripTabPath(trip.id, cta.targetTab)} className="group">
              {cta.action}
              <ArrowRight
                className="size-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
          </Button>
          <p className="mt-2 max-w-xs text-xs leading-5 text-muted-foreground">{cta.hint}</p>
        </div>
      </div>
    </section>
  );
}
