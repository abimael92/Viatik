"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarDays, Flag, MapPin, MoreVertical, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Trip } from "@/features/domain/entities";
import type { TripReadiness } from "@/features/trips/lib/readiness";
import { TripReadinessSection } from "@/features/trips/components/home/trip-readiness-section";
import { DAY_MS, daysUntil, tripTabPath } from "@/features/trips/lib/home-trips";
import { getTripCoverGradient, isTripCoverImage } from "@/features/trips/lib/trip-cover";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { cn } from "@/lib/utils";

function daysBetween(start: string, end: string): number {
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  return Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / DAY_MS);
}

/**
 * Immersive hero. In the "active" state it acts as a live cockpit (Day X of Y
 * plus an End-trip action); in the "planned" state it shows a destination
 * countdown with a Start-trip action once the trip is ready to begin.
 */
export function TripCountdownHero({
  trip,
  today,
  readiness,
  onStart,
  onEnd,
  onCancel,
}: {
  trip: Trip;
  today: Date;
  readiness: TripReadiness | null;
  onStart?: () => void;
  onEnd?: () => void;
  onCancel?: () => void;
}) {
  const { t } = useI18n();
  const active = trip.status === "active";
  const daysToStart = trip.startDate ? daysUntil(trip.startDate, today) : null;
  const countdown = daysToStart === null
    ? ""
    : daysToStart === 0
      ? t("common.todayLabel")
      : daysToStart < 0
        ? t("common.startedLabel")
        : t("common.daysLeft", { count: daysToStart });
  const destination = trip.destination ?? trip.name;
  const dayLabel = active && trip.startDate
    ? (() => {
        const day = Math.max(1, daysUntil(trip.startDate, today) + 1);
        const total = trip.endDate ? Math.max(1, daysBetween(trip.startDate, trip.endDate) + 1) : null;
        return total ? t("common.dayOf", { day, total }) : `${t("common.day")} ${day}`;
      })()
    : null;
  const readyToStart = !active && daysToStart !== null && daysToStart <= 7;
  const coverGradient = getTripCoverGradient(trip.coverImageUrl);
  const hasCoverImage = isTripCoverImage(trip.coverImageUrl);
  const overviewHref = tripTabPath(trip.id, "overview");
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <section
      className="relative overflow-hidden rounded-[1.75rem] border bg-card text-foreground shadow-sm transition-shadow hover:shadow-md"
      aria-label={active ? t("common.activeTrip") : t("common.nextTrip")}
    >
      {/* The whole card opens the trip overview. */}
      <Link href={overviewHref} aria-label={t("common.openTrip", { name: destination })} className="absolute inset-0 z-0" />

      {active && (
        <div className="pointer-events-none relative h-32 overflow-hidden sm:h-40" aria-hidden>
          <div
            className={cn(
              "absolute inset-0 bg-cover bg-center",
              !hasCoverImage && (coverGradient?.className ?? "bg-linear-to-br from-sky-500 via-blue-500 to-violet-600")
            )}
            style={hasCoverImage ? { backgroundImage: `url(${trip.coverImageUrl})` } : undefined}
          />
          <div className="absolute inset-0 bg-linear-to-t from-black/30 via-transparent to-transparent" aria-hidden />
        </div>
      )}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute bg-[radial-gradient(circle_at_14%_20%,color-mix(in_oklch,var(--viatik-magenta)_18%,transparent),transparent_36%),radial-gradient(circle_at_88%_10%,color-mix(in_oklch,var(--viatik-blue)_14%,transparent),transparent_30%)]",
          active ? "inset-x-0 top-32 h-56 sm:top-40" : "inset-0"
        )}
      />

      {/* More options (Cancel) hidden behind a three-dot menu. */}
      <div className="absolute right-3 top-3 z-20 sm:right-4 sm:top-4">
        <button
          type="button"
          onClick={() => setMenuOpen((value) => !value)}
          aria-label={t("common.moreOptions")}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="grid size-9 place-items-center rounded-full border bg-card/80 text-muted-foreground backdrop-blur transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MoreVertical className="size-5" aria-hidden />
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden />
            <div role="menu" className="absolute right-0 top-full z-20 mt-1 w-44 rounded-xl border bg-card p-1 shadow-lg">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onCancel?.();
                }}
                disabled={!onCancel}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-4" aria-hidden />
                {t("common.cancelTrip")}
              </button>
            </div>
          </>
        )}
      </div>

      <div
        className={cn(
          "relative z-10 flex flex-col gap-6 p-5 sm:flex-row sm:items-center sm:justify-between",
          active ? "sm:p-7 lg:p-8" : "sm:p-6"
        )}
      >
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-viatik-magenta">
            {active ? <Flag className="size-4" aria-hidden /> : <CalendarDays className="size-4" aria-hidden />}
            {active ? (dayLabel ? `Active · ${dayLabel}` : "Active") : countdown}
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{destination}</h1>
          <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{trip.name}</span>
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          {active ? (
            <Button variant="secondary" size="lg" className="w-full sm:w-auto" onClick={onEnd} disabled={!onEnd}>
              <Flag className="size-4" aria-hidden />
              {t("common.endTrip")}
            </Button>
          ) : null}
          {!active && !readyToStart && (
            <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
              {t("common.startAvailable", { count: 7 })}
            </p>
          )}
        </div>
      </div>

      {readiness && (
        <div className="relative z-10">
          <TripReadinessSection
            readiness={readiness}
            tripId={trip.id}
            embedded
            onStart={onStart}
            readyToStart={readyToStart}
          />
        </div>
      )}
    </section>
  );
}
