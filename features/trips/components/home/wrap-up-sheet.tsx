"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Heading } from "@/components/ui/heading";
import { normalizeActivityCategory } from "@/features/activities/domain/activity-category";
import { activityRepository } from "@/features/activities/data/dexie-activity-repository";
import { collaborationRepository } from "@/features/collaboration/data/dexie-collaboration-repository";
import type { Activity, Trip } from "@/features/domain/entities";
import { formatMinorUnits } from "@/features/domain/money";
import { SettleUpSheet } from "@/features/expenses/components/settle-up-sheet";
import { useTripBalances } from "@/features/expenses/lib/use-trip-balances";
import type { PairwiseDebt } from "@/features/expenses/lib/trip-balances";
import { useTripSpending } from "@/features/finance/lib/use-trip-spending";
import { PackingListView } from "@/features/packing/components/packing-list-view";
import { packingRepository } from "@/features/packing/data/dexie-packing-repository";
import type { PackingItem } from "@/features/packing/domain/packing-types";
import { departureStops } from "@/features/trips/lib/departure-stops";
import { resolveTripScheduleTimeZone, todayKeyInZone } from "@/features/trips/lib/home-trips";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { cn } from "@/lib/utils";

function clockLabel(value: string | null): string {
  if (!value) return "";
  const match = /T(\d{2}:\d{2})/.exec(value);
  return match?.[1] ?? (/^\d{2}:\d{2}/.test(value) ? value.slice(0, 5) : "");
}

function isMemberUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function moneyLabel(amount: bigint, currency: string): string {
  try {
    return `${formatMinorUnits(amount, currency)} ${currency}`;
  } catch {
    return `${amount.toString()} ${currency}`;
  }
}

export function WrapUpSheet({
  open,
  trip,
  userId,
  pending = false,
  onClose,
  onEndTrip,
}: {
  open: boolean;
  trip: Trip;
  userId: string;
  pending?: boolean;
  onClose: () => void;
  onEndTrip: () => void;
}) {
  const { t } = useI18n();
  const spending = useTripSpending(trip.id, trip.baseCurrency);
  const { pairwiseDebts, members } = useTripBalances(trip.id, trip.baseCurrency);
  const [items, setItems] = useState<PackingItem[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [selectedDebt, setSelectedDebt] = useState<PairwiseDebt | null>(null);
  const [settleError, setSettleError] = useState<string | null>(null);

  useEffect(() => packingRepository.watchByTrip(trip.id, setItems), [trip.id]);
  useEffect(() => activityRepository.watchByTrip(trip.id, setActivities), [trip.id]);

  useEffect(() => {
    const ids = [...new Set(members.map((member) => member.userId).filter((id): id is string => Boolean(id)))];
    if (!ids.length) return;
    let cancelled = false;
    void collaborationRepository.listProfiles(ids).then((profiles) => {
      if (cancelled) return;
      setNames(new Map(profiles.map((profile) => [profile.id, profile.fullName?.trim() || "Traveler"])));
    }).catch(() => {
      if (!cancelled) setNames(new Map());
    });
    return () => {
      cancelled = true;
    };
  }, [members]);

  const unpacked = items.filter((item) => item.deletedAt == null && item.packedForReturn !== true).length;
  const openDebts = pairwiseDebts.length;
  const warning = [
    unpacked > 0 ? t("copy.wrapUpUnpacked", { count: unpacked }) : null,
    openDebts > 0 ? t("copy.wrapUpDebts", { count: openDebts }) : null,
  ].filter((part): part is string => Boolean(part)).join(" ");

  const today = todayKeyInZone(resolveTripScheduleTimeZone(trip));
  const stops = departureStops(activities, today);
  const budget = spending.budget?.totalBudgetMinor ?? 0n;
  const spent = moneyLabel(spending.totalSpent, trip.baseCurrency);
  const budgetLabel = budget > 0n ? moneyLabel(budget, trip.baseCurrency) : null;

  function nameFor(id: string): string {
    if (id === userId) return t("common.you");
    return names.get(id) ?? "Traveler";
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
        <DialogContent className={cn("max-h-[90dvh] overflow-y-auto", "sm:max-w-2xl")}>
          <DialogHeader>
            <DialogTitle>{t("copy.wrapUpTitle")}</DialogTitle>
            <DialogDescription>{t("copy.wrapUpDescription")}</DialogDescription>
          </DialogHeader>

          <section aria-labelledby="wrap-up-packing" className="space-y-3">
            <Heading level={3} id="wrap-up-packing" className="text-base font-semibold">
              {t("copy.packForHomeTitle")}
            </Heading>
            <PackingListView tripId={trip.id} trip={trip} activities={activities} mode="return" canEdit={false} />
          </section>

          <section aria-labelledby="wrap-up-money" className="space-y-3">
            <Heading level={3} id="wrap-up-money" className="text-base font-semibold">
              {t("copy.wrapUpMoney")}
            </Heading>
            <p className="text-sm text-foreground">
              {budgetLabel
                ? t("copy.wrapUpSpentOfBudget", { spent, budget: budgetLabel })
                : t("copy.wrapUpSpent", { spent })}
            </p>
            {pairwiseDebts.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("copy.wrapUpNoDebts")}</p>
            ) : (
              <ul className="space-y-2">
                {pairwiseDebts.map((debt) => {
                  const canSettle = isMemberUuid(debt.payerId) && isMemberUuid(debt.receiverId);
                  return (
                    <li key={`${debt.payerId}:${debt.receiverId}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                      <p className="text-sm">
                        {nameFor(debt.payerId)} {t("copy.owes")} {nameFor(debt.receiverId)}{" "}
                        {moneyLabel(debt.amountMinor, debt.currency)}
                      </p>
                      {canSettle ? (
                        <Button type="button" size="sm" variant="outline" onClick={() => setSelectedDebt(debt)}>
                          {t("copy.settleUp")}
                        </Button>
                      ) : (
                        <p className="text-xs text-muted-foreground">{t("copy.wrapUpMemberSettleOnly")}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {settleError && <p role="alert" className="text-sm text-destructive">{settleError}</p>}
          </section>

          <section aria-labelledby="wrap-up-departure" className="space-y-3">
            <Heading level={3} id="wrap-up-departure" className="text-base font-semibold">
              {t("copy.wrapUpGettingOut")}
            </Heading>
            {stops.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("copy.wrapUpNoDeparture")}</p>
            ) : (
              <ol className="space-y-2">
                {stops.map((stop) => (
                  <li key={stop.id} className="rounded-lg border p-3">
                    <p className="text-sm font-semibold">{stop.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {normalizeActivityCategory(stop.category) === "lodging" ? t("common.lodging") : t("common.transit")}
                      {" · "}
                      {stop.dayDate}
                      {clockLabel(stop.startTime) ? ` · ${clockLabel(stop.startTime)}` : ""}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {warning && (
            <p role="status" className="text-sm text-foreground">
              {warning}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("copy.notYet")}
            </Button>
            <Button type="button" variant="primary" onClick={onEndTrip} disabled={pending}>
              {t("common.endTrip")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <SettleUpSheet
        open={selectedDebt !== null}
        tripId={trip.id}
        userId={userId}
        debt={selectedDebt}
        payerName={selectedDebt ? nameFor(selectedDebt.payerId) : ""}
        receiverName={selectedDebt ? nameFor(selectedDebt.receiverId) : ""}
        onClose={() => setSelectedDebt(null)}
        onError={setSettleError}
        onSaved={() => setSelectedDebt(null)}
      />
    </>
  );
}
