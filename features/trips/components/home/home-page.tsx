"use client";

import { localizeThrownError } from "@/lib/i18n/localize-error";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Plane, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { WrapUpSheet } from "@/features/trips/components/home/wrap-up-sheet";
import { queueReturnPackReminder } from "@/features/trips/lib/return-pack-reminder";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { notifyTripStarted } from "@/app/actions/trip-notifications";
import { DocumentRiskBanner } from "@/features/health/components/document-risk-banner";
import { SharedTripFeed } from "@/features/feed/components/shared-trip-feed";
import { tripRepository } from "@/features/trips/data/dexie-trip-repository";
import { useHomeData } from "@/features/trips/components/home/use-home-data";
import { HomeSkeleton } from "@/features/trips/components/home/home-skeleton";
import { TripCountdownHero } from "@/features/trips/components/home/trip-countdown-hero";
import { LiveTimelineHud } from "@/features/trips/components/home/live-timeline-hud";
import { TripNotesBoard } from "@/features/trips/components/home/trip-notes-board";
import { OpenTasksWidget } from "@/features/trips/components/home/open-tasks-widget";
import { ActiveTripActions } from "@/features/trips/components/home/active-trip-actions";
import { OngoingTripsQuickView } from "@/features/trips/components/home/ongoing-trips-quick-view";
import { PreTripSection } from "@/features/trips/components/home/pre-trip-section";
import { WithinNext24HoursBanner } from "@/features/trips/components/home/within-24-hours-banner";
import { TripStepsWidget } from "@/features/steps/components/trip-steps-widget";
import { QuickActionHub } from "@/features/trips/components/home/quick-action-hub";
import { SuggestionsDrawer } from "@/features/community/components/suggestions-drawer";
import { MoneyToolsDialog } from "@/features/finance/components/money-dashboard";
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
  const { loading, primaryTrip, activeTrip, ongoingTrips, readiness, timeline, canManageExpenses } = useHomeData(userId);
  const [pending, setPending] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [moneyToolsOpen, setMoneyToolsOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!primaryTrip) return;
    void queueReturnPackReminder({ userId, trip: primaryTrip, message: t("copy.packForHome") });
  }, [primaryTrip, t, userId]);

  if (loading) {
    return (
      <div className="w-full">
        <HomeSkeleton />
      </div>
    );
  }

  // The operational cockpit stays hidden until the user explicitly starts the trip.
  const isActive = primaryTrip?.status === "active";

  function handleStart(tripId = primaryTrip?.id) {
    if (!tripId || pending) return;
    setPending(true);
    void tripRepository
      .startTrip(tripId)
      .then(() => void notifyTripStarted(tripId).catch(() => undefined))
      .finally(() => setPending(false));
  }

  function handleEnd() {
    if (!primaryTrip || pending) return;
    setConfirmEnd(true);
  }

  function confirmEndTrip() {
    if (!primaryTrip || pending) return;
    setConfirmEnd(false);
    setPending(true);
    void tripRepository.endTrip(primaryTrip.id)
      .then(() => toast({ title: t("copy.tripEnded"), description: t("copy.tripMovedPast"), variant: "success" }))
      .catch((cause) => toast({ title: t("copy.unableEndTrip"), description: localizeThrownError(cause, t, t("copy.pleaseTryAgain")), variant: "error" }))
      .finally(() => setPending(false));
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
      .then(() => toast({ title: t("copy.tripCancelled"), description: t("copy.tripMovedPast"), variant: "success" }))
      .finally(() => setPending(false));
  }

  return (
    <>
      <div className="flex w-full flex-col gap-6 pb-32">
        {primaryTrip ? (
          <>
            <WithinNext24HoursBanner startDate={primaryTrip.startDate} />
            <TripCountdownHero
              trip={primaryTrip}
              today={new Date()}
              readiness={readiness}
              onStart={() => handleStart()}
              onEnd={handleEnd}
              onCancel={handleCancel}
            />
            <OngoingTripsQuickView
              trips={ongoingTrips}
              featuredTripId={primaryTrip.id}
              pending={pending}
              onStartTrip={handleStart}
            />

            {!isActive && (
              <PreTripSection trip={primaryTrip} timeline={timeline} userId={userId} />
            )}

            {isActive && (
              <>
                <DocumentRiskBanner userId={userId} destination={primaryTrip.destination} travelDate={primaryTrip.startDate} />

                {/* Active cockpit: timeline wide left, secondary widgets right at xl+. */}
                <div className="xl:grid xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:gap-6">
                  <LiveTimelineHud
                    trip={primaryTrip}
                    items={timeline}
                    active
                    userId={userId}
                    canManageExpenses={canManageExpenses}
                  />

                  <div className="mt-6 flex flex-col gap-6 xl:col-start-2 xl:mt-0">
                    <TripNotesBoard tripId={primaryTrip.id} userId={userId} />

                    <OpenTasksWidget tripId={primaryTrip.id} userId={userId} />

                    <ActiveTripActions activeTrip={activeTrip} />

                    {primaryTrip.startedAt && primaryTrip.endDate && (
                      <TripStepsWidget
                        tripId={primaryTrip.id}
                        userId={userId}
                        startedAt={primaryTrip.startedAt}
                        endDate={primaryTrip.endDate}
                        compact
                      />
                    )}

                    <section className="rounded-2xl border bg-card p-5 sm:p-6">
                      <SharedTripFeed
                        tripId={primaryTrip.id}
                        userId={userId}
                        limit={4}
                        heading={t("copy.recentActivity")}
                        emptyMessage={t("copy.recentActivityEmpty")}
                      />
                    </section>
                  </div>
                </div>
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
        <QuickActionHub userId={userId} primaryTrip={primaryTrip} onOpenMoneyTools={() => setMoneyToolsOpen(true)} />

        {primaryTrip && moneyToolsOpen && (
          <MoneyToolsDialog open={moneyToolsOpen} onOpenChange={setMoneyToolsOpen} trip={primaryTrip} />
        )}

        {!primaryTrip && (
          <SuggestionsDrawer
            userId={userId}
            open={suggestionsOpen}
            onOpenChange={setSuggestionsOpen}
            showTrigger={false}
            inline
          />
        )}

        {confirmEnd && primaryTrip && (
          <WrapUpSheet
            open
            trip={primaryTrip}
            userId={userId}
            pending={pending}
            onClose={() => setConfirmEnd(false)}
            onEndTrip={confirmEndTrip}
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
