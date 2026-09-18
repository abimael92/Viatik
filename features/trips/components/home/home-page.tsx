"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Plane, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { DocumentRiskBanner } from "@/features/health/components/document-risk-banner";
import { SharedTripFeed } from "@/features/feed/components/shared-trip-feed";
import { tripRepository } from "@/features/trips/data/dexie-trip-repository";
import { useHomeData } from "@/features/trips/components/home/use-home-data";
import { HomeSkeleton } from "@/features/trips/components/home/home-skeleton";
import { TripCountdownHero } from "@/features/trips/components/home/trip-countdown-hero";
import { LiveTimelineHud } from "@/features/trips/components/home/live-timeline-hud";
import { QuickActionHub } from "@/features/trips/components/home/quick-action-hub";
import { SuggestionsDrawer } from "@/features/community/components/suggestions-drawer";
import { useI18n } from "@/lib/i18n/i18n-provider";

/**
 * Post-login home dashboard — the "operational cockpit". It is deliberately
 * focused only on the immediate trip (hero + readiness + today's timeline +
 * quick actions) and never surfaces the trip library, recent activity, or
 * community suggestions. A single "N trips planned" hint deep-links to the
 * Trips library when other planned trips exist.
 */
export function HomePage({ userId }: { userId: string }) {
  const { t } = useI18n();
  const { loading, primaryTrip, readiness, timeline } = useHomeData(userId);
  const [pending, setPending] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const { toast } = useToast();

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <HomeSkeleton />
      </div>
    );
  }

  // The operational cockpit stays hidden until the user explicitly starts the trip.
  const isActive = primaryTrip?.status === "active";

  function handleStart() {
    if (!primaryTrip || pending) return;
    setPending(true);
    void tripRepository.startTrip(primaryTrip.id).finally(() => setPending(false));
  }

  function handleEnd() {
    if (!primaryTrip || pending) return;
    if (!window.confirm("End this trip? It will move to Past Trips.")) return;
    setPending(true);
    void tripRepository.endTrip(primaryTrip.id).finally(() => setPending(false));
  }

  function handleCancel() {
    if (!primaryTrip || pending) return;
    setConfirmCancel(true);
  }

  function confirmCancelTrip() {
    if (!primaryTrip || pending) return;
    setConfirmCancel(false);
    setPending(true);
    void tripRepository
      .cancelTrip(primaryTrip.id)
      .then(() => toast({ title: "Trip cancelled", description: "It has been moved to Past Trips.", variant: "success" }))
      .finally(() => setPending(false));
  }

  return (
    <>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 pb-32 sm:px-6 lg:px-8">
        {primaryTrip ? (
          <>
            <TripCountdownHero
              trip={primaryTrip}
              today={new Date()}
              readiness={readiness}
              onStart={handleStart}
              onEnd={handleEnd}
              onCancel={handleCancel}
            />

            {isActive && (
              <>
                <DocumentRiskBanner userId={userId} destination={primaryTrip.destination} travelDate={primaryTrip.startDate} />

                <LiveTimelineHud trip={primaryTrip} items={timeline} active userId={userId} />

                <section className="rounded-2xl border bg-card p-5 sm:p-6">
                  <SharedTripFeed
                    tripId={primaryTrip.id}
                    userId={userId}
                    limit={4}
                    heading="Recent activity"
                    emptyMessage="No activity yet. Changes you make on this trip appear here."
                  />
                </section>
              </>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Plane className="size-7" aria-hidden />
            </span>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("common.whereToNext")}</h1>
            <p className="max-w-md text-sm text-muted-foreground sm:text-base">
              {t("common.createTripDescription")}
            </p>
            <Button asChild variant="primary" size="lg" className="mt-2">
              <Link href="/trips">
                {t("common.createFirstTrip")} <ArrowRight />
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="mt-2"
              onClick={() => setSuggestionsOpen(true)}
            >
              <Sparkles className="size-4 text-viatik-magenta" aria-hidden />
              {t("common.travelIdeas")}
            </Button>
          </div>
        )}

        {/* Quick actions — always visible, at the bottom of the Home container. */}
        <QuickActionHub userId={userId} primaryTrip={primaryTrip} />

        {!primaryTrip && (
          <SuggestionsDrawer
            userId={userId}
            open={suggestionsOpen}
            onOpenChange={setSuggestionsOpen}
            showTrigger={false}
            inline
          />
        )}

        <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("common.cancelThisTrip")}</DialogTitle>
              <DialogDescription>
                {t("common.cancelTripDescription")}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmCancel(false)} disabled={pending}>
                {t("common.keepTrip")}
              </Button>
              <Button variant="destructive" onClick={() => void confirmCancelTrip()} disabled={pending}>
                {t("common.cancelTrip")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {primaryTrip && !isActive && <SuggestionsDrawer userId={userId} />}
    </>
  );
}
