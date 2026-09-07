"use client";

import Link from "next/link";
import { ArrowRight, Plane } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { DocumentRiskBanner } from "@/features/health/components/document-risk-banner";
import { SharedTripFeed } from "@/features/feed/components/shared-trip-feed";
import { tripTabPath } from "@/features/trips/lib/home-trips";
import { useHomeData } from "@/features/trips/components/home/use-home-data";
import { HomeSkeleton } from "@/features/trips/components/home/home-skeleton";
import { TripCountdownHero } from "@/features/trips/components/home/trip-countdown-hero";
import { TripReadinessCard } from "@/features/trips/components/home/trip-readiness-card";
import { UpcomingTimelineSnippet } from "@/features/trips/components/home/upcoming-timeline-snippet";
import { QuickActionHub } from "@/features/trips/components/home/quick-action-hub";

/**
 * Post-login home dashboard ("travel operating system" landing). Composes the
 * countdown hero, readiness score, timeline snapshot, and quick-action strip
 * from the local-first data layer.
 */
export function HomePage({ userId }: { userId: string }) {
  const { loading, primaryTrip, activeTrip, readiness, timeline, hasAnyTrip } = useHomeData(userId);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <HomeSkeleton />
      </div>
    );
  }

  if (!primaryTrip || !hasAnyTrip) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-center gap-4 px-4 py-24 text-center sm:px-6">
        <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Plane className="size-7" aria-hidden />
        </span>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Where to next?</h1>
        <p className="max-w-md text-sm text-muted-foreground sm:text-base">
          Create your first trip to start building an itinerary, sharing expenses, and keeping
          everyone in sync — even offline.
        </p>
        <Button asChild variant="primary" size="lg" className="mt-2">
          <Link href="/trips">
            Create your first trip <ArrowRight />
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <TripCountdownHero trip={primaryTrip} today={new Date()} nextAction={readiness?.nextAction ?? null} />

      <DocumentRiskBanner userId={userId} destination={primaryTrip.destination} travelDate={primaryTrip.startDate} />

      <div className="grid gap-6 lg:grid-cols-2">
        {readiness && <TripReadinessCard readiness={readiness} tripId={primaryTrip.id} />}
        <UpcomingTimelineSnippet trip={primaryTrip} items={timeline} active={Boolean(activeTrip)} />
      </div>

      <QuickActionHub userId={userId} primaryTrip={primaryTrip} />

      <section className="rounded-2xl border bg-card p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <Heading level={2} className="text-base font-semibold">Recent activity</Heading>
          <Button asChild variant="ghost" size="sm">
            <Link href={tripTabPath(primaryTrip.id, "overview")}>Open trip</Link>
          </Button>
        </div>
        <div className="mt-3">
          <SharedTripFeed tripId={primaryTrip.id} userId={userId} limit={4} emptyMessage="No activity yet. Changes you make on this trip appear here." />
        </div>
      </section>
    </div>
  );
}
