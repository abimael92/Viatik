"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { Trip } from "@/features/domain/entities";
import { useI18n } from "@/lib/i18n/i18n-provider";

export function OngoingTripsQuickView({
  trips,
  featuredTripId,
  pending,
  onStartTrip,
}: {
  trips: Trip[];
  featuredTripId: string | null;
  pending: boolean;
  onStartTrip: (tripId: string) => void;
}) {
  const { t } = useI18n();
  const additionalTrips = trips.filter((trip) => trip.id !== featuredTripId);

  if (additionalTrips.length === 0) return null;

  return (
    <section aria-labelledby="ongoing-trips-heading" className="rounded-2xl border bg-card p-5 sm:p-6">
      <h2 id="ongoing-trips-heading" className="text-base font-semibold">
        {t("copy.activeTrips")}
      </h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {additionalTrips.map((trip) => (
          <article key={trip.id} className="flex flex-col gap-3 rounded-xl border bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
            <Link
              href={`/trips/${trip.id}`}
              aria-label={t("common.openTrip", { name: trip.name })}
              className="min-w-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-viatik-magenta">
                {t("common.tripInProgress")}
              </p>
              <h3 className="mt-1 truncate font-semibold">{trip.destination ?? trip.name}</h3>
              {trip.destination && <p className="truncate text-sm text-muted-foreground">{trip.name}</p>}
            </Link>
            {trip.status === "planned" && (
              <Button
                variant="primary"
                size="sm"
                disabled={pending}
                onClick={() => onStartTrip(trip.id)}
              >
                {t("copy.startTrip")}
              </Button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
