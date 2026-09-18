"use client";

import { ArrowRight, PiggyBank, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Trip, TripBudget } from "@/features/domain/entities";
import {
  decimalFromMinorUnits,
  formatMinorUnits,
  parseMinorUnits,
} from "@/features/domain/money";
import { currencyRateRepository } from "@/features/finance/data/dexie-currency-rate-repository";
import { tripBudgetRepository } from "@/features/finance/data/dexie-finance-repository";
import { budgetUserCurrency, convertBudget, minorToInput, recommendedDailyBudget } from "@/features/finance/lib/budget-currency";
import { formatAmount, getTipCustoms, lookupRate, parseAmount } from "@/features/finance/lib/currency-converter";
import type { CurrencyCode } from "@/features/finance/domain/currency-types";
import { useLocalProfile } from "@/features/profile/lib/use-local-profile";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { cn } from "@/lib/utils";

/**
 * Trip budget editor for the Settings tab. Reads/writes the same `TripBudget`
 * record the Money & Budget hub uses, so the two stay in sync. A read-only
 * local→base currency conversion is shown beside the fields for context.
 */
export function BudgetSettings({
  trip,
  userId,
  canEdit,
}: {
  trip: Trip;
  userId: string;
  canEdit: boolean;
}) {
  const { t } = useI18n();
  const baseCurrency = trip.baseCurrency || "USD";
  const [budget, setBudget] = useState<TripBudget | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [totalInput, setTotalInput] = useState("");
  const [dailyInput, setDailyInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => tripBudgetRepository.watchByTrip(trip.id, setBudget), [trip.id]);

  // The budget is entered in the user's preferred currency (when supported and
  // different from the trip base), and stored converted into the base currency.
  const preferredCurrency = useLocalProfile(userId)?.preferredCurrency;
  const userCurrency = budgetUserCurrency(preferredCurrency, baseCurrency);
  const usesUserCurrency = userCurrency !== baseCurrency;

  const totalBudget = budget?.totalBudgetMinor != null && budget.totalBudgetMinor > 0n ? budget.totalBudgetMinor : null;
  const dailyTarget = budget?.dailyTargetMinor != null && budget.dailyTargetMinor > 0n ? budget.dailyTargetMinor : null;

  // Recommended daily pace: total budget spread across the trip days, leaving a
  // buffer so there's money left over at the end.
  const dayCount = tripDayCount(trip.startDate, trip.endDate);
  const recommendedDaily = totalBudget !== null && dayCount > 0 ? recommendedDailyBudget(totalBudget, dayCount) : null;

  function beginEdit() {
    setTotalInput(
      totalBudget !== null
        ? minorToInput(convertBudget(totalBudget, baseCurrency, userCurrency), userCurrency)
        : ""
    );
    setDailyInput(dailyTarget !== null ? decimalFromMinorUnits(dailyTarget, baseCurrency) : "");
    setError(null);
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const totalUser = totalInput.trim() ? parseAmount(totalInput, userCurrency) : 0n;
      const total = convertBudget(totalUser, userCurrency, baseCurrency);
      const daily = dailyInput.trim() ? parseMinorUnits(dailyInput, baseCurrency) : null;
      await tripBudgetRepository.upsert({
        id: budget?.id ?? crypto.randomUUID(),
        tripId: trip.id,
        totalBudgetMinor: total,
        dailyTargetMinor: daily,
        categoryAllocations: budget?.categoryAllocations ?? [],
        createdBy: trip.ownerId,
      });
      setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("common.noBudget"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-card p-5" aria-labelledby="budget-settings-heading">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <PiggyBank className="size-5" aria-hidden />
          </span>
          <div>
            <Heading level={2} id="budget-settings-heading" className="text-base font-semibold">
              {t("common.tripBudgetSpending")}
            </Heading>
            <p className="text-sm text-muted-foreground">
              {t("common.budgetDescription")}
            </p>
          </div>
        </div>
        {canEdit && !editing && (
          <Button variant="outline" size="sm" className={totalBudget !== null ? "border-yellow-300 bg-yellow-50 text-yellow-700 hover:bg-yellow-100" : "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"} onClick={beginEdit}>
            {totalBudget !== null ? t("common.edit") : t("common.setBudget")}
          </Button>
        )}
      </div>

      {!canEdit && (
        <p className="mt-4 text-sm text-muted-foreground">
          {t("common.viewOnlyBudget")}
        </p>
      )}

      {canEdit && editing ? (
        <div className="mt-4 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="settings-budget-total">{t("common.totalTripBudget")} ({userCurrency})</Label>
            <Input
              id="settings-budget-total"
              inputMode="decimal"
              value={totalInput}
              onChange={(event) => setTotalInput(event.target.value)}
              placeholder="e.g. 2000.00"
            />
            {usesUserCurrency && totalInput.trim() && totalInput.trim() !== "." && (
              <BudgetConversionText input={totalInput} from={userCurrency} to={baseCurrency} />
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="settings-budget-daily">{t("common.dailySpendingTarget")} ({baseCurrency}) · {t("common.optional")}</Label>
            <Input
              id="settings-budget-daily"
              inputMode="decimal"
              value={dailyInput}
              onChange={(event) => setDailyInput(event.target.value)}
              placeholder="e.g. 150.00"
            />
            <p className="text-xs text-muted-foreground">
              {t("common.blankToPace")}
            </p>
            {recommendedDaily !== null ? (
              <p className="text-xs text-primary">
                {t("common.recommended")}: <span className="font-semibold">{formatMinorUnits(recommendedDaily, baseCurrency)}</span>/day
                {" "}— keeps ~10% of your {formatMinorUnits(totalBudget!, baseCurrency)} budget as a buffer over {dayCount} day{dayCount === 1 ? "" : "s"}.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Set a total budget to see a recommended daily amount.
              </p>
            )}
          </div>
          <ReadOnlyConversion trip={trip} baseCurrency={baseCurrency} />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={() => void handleSave()} disabled={saving}>
              {saving ? t("settings.saving") : t("common.saveBudget")}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
            <div>
              <p className="text-xs text-muted-foreground">{t("common.totalBudget")}</p>
              <p className="font-mono text-2xl font-bold tabular-nums">
                {totalBudget !== null ? formatMinorUnits(totalBudget, baseCurrency) : t("common.notSet")}
              </p>
            </div>
            {dailyTarget !== null && (
              <div>
                <p className="text-xs text-muted-foreground">{t("common.dailyTarget")}</p>
                <p className="font-mono text-2xl font-bold tabular-nums">
                  {formatMinorUnits(dailyTarget, baseCurrency)}<span className="text-sm font-normal text-muted-foreground">/day</span>
                </p>
              </div>
            )}
          </div>
          {totalBudget === null && (
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
              <Wallet className="mt-0.5 size-4 shrink-0" aria-hidden />
              {t("common.noBudget")}
            </p>
          )}
          <ReadOnlyConversion trip={trip} baseCurrency={baseCurrency} />
        </div>
      )}
    </div>
  );
}

/** Read-only "1 local = rate yours" line shown next to the budget fields. */
function ReadOnlyConversion({ trip, baseCurrency }: { trip: Trip; baseCurrency: string }) {
  const customs = useMemo(() => getTipCustoms(trip.destination), [trip.destination]);
  const nativeCurrency = (customs.currencies[0] ?? baseCurrency).toUpperCase() as CurrencyCode;
  const [rate, setRate] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (nativeCurrency === baseCurrency.toUpperCase()) {
        if (!cancelled) setRate(1);
        return;
      }
      const cached = await currencyRateRepository.getRate(nativeCurrency, baseCurrency);
      if (cancelled) return;
      setRate(cached?.rate ?? (lookupRateSafe(nativeCurrency, baseCurrency) ?? null));
    })();
    return () => {
      cancelled = true;
    };
  }, [nativeCurrency, baseCurrency]);

  const same = nativeCurrency === baseCurrency.toUpperCase();

  return (
    <div className="mt-3 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
      <Wallet className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      {same ? (
        <span>
          Local currency ({nativeCurrency}) matches your home currency ({baseCurrency.toUpperCase()}).
        </span>
      ) : (
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold text-foreground">1 {nativeCurrency}</span>
          <ArrowRight className="size-3.5" aria-hidden />
          <span className="font-mono font-semibold text-foreground tabular-nums">
            {rate !== null ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(rate) : "—"}
          </span>
          <span className="font-semibold text-foreground">{baseCurrency.toUpperCase()}</span>
          <span className={cn("text-xs")}>· local → your currency</span>
        </span>
      )}
    </div>
  );
}

function lookupRateSafe(from: CurrencyCode, to: string): number | null {
  try {
    return lookupRate(from, to.toUpperCase() as CurrencyCode);
  } catch {
    return null;
  }
}

function BudgetConversionText({ input, from, to }: { input: string; from: string; to: string }) {
  const converted = useMemo(() => {
    try {
      return convertBudget(parseAmount(input, from), from, to);
    } catch {
      return null;
    }
  }, [input, from, to]);
  if (converted === null) return null;
  return (
    <p className="text-xs text-muted-foreground">
      ≈ {formatAmount(converted, to)} in {to}
    </p>
  );
}

/** Whole trip days between `start` and `end` (inclusive), or 0 if dates are missing/invalid. */
function tripDayCount(start: string | null | undefined, end: string | null | undefined): number {
  if (!start || !end || end < start) return 0;
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return 0;
  return Math.floor((endMs - startMs) / 86_400_000) + 1;
}
