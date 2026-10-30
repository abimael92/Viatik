"use client";

import { differenceInCalendarDays, isValid, parseISO } from "date-fns";
import { CalendarClock, PiggyBank, PlaneTakeoff } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MinorUnits } from "@/features/domain/money";
import {
  decimalFromMinorUnits,
  formatMinorUnits,
  parseMinorUnits,
} from "@/features/domain/money";
import { flightBookingWindowDays } from "@/features/trip-planner/domain/flight-booking-window";
import { formatIsoTripDay } from "@/features/trip-planner/domain/date-format";
import { buildIdeaSchedule } from "@/features/trip-planner/domain/idea-schedule";
import type { TripIdea, TripSavingsPlan } from "@/features/trip-planner/domain/trip-planner-types";
import { formatTravelWindow } from "@/features/trip-planner/domain/travel-window";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/lib/i18n/translations";


function TimelineStep({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  last,
}: {
  icon: typeof PiggyBank;
  label: string;
  value: string;
  hint?: string;
  tone: string;
  last?: boolean;
}) {
  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          aria-hidden
          className={cn("grid size-7 shrink-0 place-items-center rounded-full", tone)}
        >
          <Icon className="size-3.5" />
        </span>
        {!last && <span aria-hidden className="w-px flex-1 bg-border" />}
      </div>
      <div className={cn("min-w-0", !last && "pb-4")}>
        <p className="text-[10px] font-semibold uppercase leading-none tracking-[0.08em] text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 text-sm font-semibold leading-snug text-foreground">{value}</p>
        {hint && <p className="text-xs leading-snug text-muted-foreground">{hint}</p>}
      </div>
    </li>
  );
}

export function SavingsPlanner({
  idea,
  plan,
  onSave,
  bare = false,
}: {
  idea: TripIdea;
  plan: TripSavingsPlan | undefined;
  onSave: (input: {
    currentSavingsMinor: MinorUnits;
    cadence: TripSavingsPlan["cadence"];
  }) => Promise<void>;
  /** Embedded in a tab: no card chrome and no duplicate heading. */
  bare?: boolean;
}) {
  const { t, locale } = useI18n();
  const [currentInput, setCurrentInput] = useState(
    decimalFromMinorUnits(plan?.currentSavingsMinor ?? 0n, idea.currency)
  );
  const [cadence, setCadence] = useState<TripSavingsPlan["cadence"]>(() => {
    const daysUntil =
      idea.startDate && isValid(parseISO(idea.startDate))
        ? differenceInCalendarDays(parseISO(idea.startDate), new Date())
        : null;
    if (daysUntil != null && daysUntil >= 30) return "monthly";
    if (daysUntil != null && daysUntil > 0) return plan?.cadence === "once" ? "once" : "weekly";
    return plan?.cadence ?? "monthly";
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const daysUntilTrip =
    idea.startDate && isValid(parseISO(idea.startDate))
      ? differenceInCalendarDays(parseISO(idea.startDate), new Date())
      : null;
  const isNearTerm = daysUntilTrip != null && daysUntilTrip > 0 && daysUntilTrip < 30;

  let currentSavingsMinor = plan?.currentSavingsMinor ?? 0n;
  let inputError: string | null = null;
  try {
    currentSavingsMinor = currentInput.trim() ? parseMinorUnits(currentInput, idea.currency) : 0n;
  } catch {
    inputError = t("copy.tripSavingsInvalidAmount");
  }

  // The booking window is fare-based and currency-aware, so a peso fare is not
  // mistaken for a long-haul one.
  const transportMinor =
    idea.categoryEstimates.find((estimate) => estimate.category === "transport")?.amountMinor ?? 0n;
  const farePerPerson =
    idea.adultCount > 0
      ? Number(decimalFromMinorUnits(transportMinor / BigInt(idea.adultCount), idea.currency))
      : 0;
  const bookingWindowDays = flightBookingWindowDays(farePerPerson, idea.currency);

  // Everything comes from the answers Scout already collected, so the card and
  // the wizard can never disagree.
  const schedule = inputError
    ? null
    : buildIdeaSchedule({
        targetTripCostMinor: idea.targetTripCostMinor,
        currentSavingsMinor,
        savingsCapacityMinor: idea.savingsCapacityMinor,
        savingsCadence: idea.savingsCadence,
        preferredCadence: cadence,
        targetMonth: idea.targetMonth,
        startDate: idea.startDate,
        endDate: idea.endDate,
        durationDays: idea.durationDays,
        bookingWindowDays,
      });

  const targetMinor = idea.targetTripCostMinor;
  const progress =
    targetMinor != null && targetMinor > 0n
      ? Math.min(100, Number((currentSavingsMinor * 100n) / targetMinor))
      : null;

  const cadenceKey: TranslationKey =
    schedule?.cadence === "weekly"
      ? "copy.tripSavingsCadenceWeekly"
      : schedule?.cadence === "once"
        ? "copy.tripSavingsCadenceOnce"
        : "copy.tripSavingsCadenceMonthly";

  const durationLabel = schedule
    ? schedule.cadence === "weekly"
      ? t("copy.tripSavingsWeeks", { count: schedule.periods })
      : schedule.cadence === "monthly"
        ? t("copy.tripSavingsMonths", { count: schedule.periods })
        : null
    : null;

  async function handleSave() {
    setError(null);
    try {
      const value = currentInput.trim() ? parseMinorUnits(currentInput, idea.currency) : 0n;
      setSaving(true);
      await onSave({ currentSavingsMinor: value, cadence });
    } catch {
      setError(t("copy.tripSavingsSaveError"));
    } finally {
      setSaving(false);
    }
  }

  // Embedded in the card's tab: one line per step, no labels or hints, so the
  // panel stays short and matches the other tabs.
  if (bare) {
    const steps = schedule
      ? [
          {
            key: "start",
            icon: PiggyBank,
            tone: "bg-viatik-magenta/15 text-viatik-magenta",
            label: t("copy.tripSavingsStepStart"),
            value:
              schedule.contributionMinor === 0n
                ? t("copy.tripSavingsGoalMet")
                : `${formatMinorUnits(schedule.contributionMinor, idea.currency, locale)} ${t(cadenceKey)}`,
            hint: schedule.contributionMinor === 0n ? undefined : durationLabel,
          },
          {
            key: "buy",
            icon: PlaneTakeoff,
            tone: "bg-viatik-blue/15 text-viatik-blue",
            label: t("copy.tripSavingsStepBuy"),
            value: formatIsoTripDay(schedule.bookBy, locale) ?? schedule.bookBy,
            hint: undefined,
          },
          {
            key: "trip",
            icon: CalendarClock,
            tone: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
            label: t("copy.tripSavingsStepTrip"),
            value: formatTravelWindow(
              { start: schedule.departureStart, end: schedule.departureEnd },
              locale
            ),
            hint: t("copy.tripIdeaDurationDays", { days: schedule.days }),
          },
        ]
      : [];

    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              {t("copy.tripSavingsTarget", { currency: idea.currency })}
            </p>
            {progress != null && (
              <span className="text-[11px] font-semibold tabular-nums text-viatik-magenta">
                {progress}%
              </span>
            )}
          </div>
          <p className="mt-1 text-lg font-bold leading-none tabular-nums text-foreground">
            {targetMinor == null
              ? t("copy.tripSavingsAddTarget")
              : formatMinorUnits(targetMinor, idea.currency, locale)}
          </p>
          {targetMinor != null && (
            <div aria-hidden className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-viatik-gradient"
                style={{ width: `${progress ?? 0}%` }}
              />
            </div>
          )}
        </div>

        {!schedule ? (
          <p className="text-[13px] text-muted-foreground">
            {t("copy.tripSavingsNeedDateAndTarget")}
          </p>
        ) : (
          <ul className="space-y-2">
            {steps.map((step) => (
              <li key={step.key} className="flex items-start gap-2.5">
                <span
                  aria-hidden
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-lg",
                    step.tone
                  )}
                >
                  <step.icon className="size-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase leading-none tracking-[0.06em] text-muted-foreground">
                    {step.label}
                  </p>
                  <p className="mt-1 text-[13px] font-semibold leading-snug text-foreground">
                    {step.value}
                  </p>
                  {step.hint && (
                    <p className="text-[11px] leading-snug text-muted-foreground">{step.hint}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <Label
              htmlFor={`current-savings-${idea.id}`}
              className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground"
            >
              {t("copy.tripSavingsCurrentShort", { currency: idea.currency })}
            </Label>
            <Input
              id={`current-savings-${idea.id}`}
              className="h-10"
              inputMode="decimal"
              value={currentInput}
              onChange={(event) => setCurrentInput(event.target.value)}
              aria-invalid={Boolean(inputError)}
              aria-describedby={inputError ? `savings-error-${idea.id}` : undefined}
            />
          </div>
          <Button
            type="button"
            className="h-10"
            onClick={() => void handleSave()}
            disabled={saving || Boolean(inputError)}
          >
            {saving ? t("copy.tripSavingsSaving") : t("copy.tripSavingsSave")}
          </Button>
        </div>

        {inputError && (
          <p id={`savings-error-${idea.id}`} role="alert" className="text-xs text-destructive">
            {inputError}
          </p>
        )}
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <Card
      className="space-y-4 p-5"
      aria-labelledby={`savings-heading-${idea.id}`}
    >
      <div>
        <h3 id={`savings-heading-${idea.id}`} className="text-base font-semibold">
          {t("copy.tripSavingsHeading")}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">{t("copy.tripSavingsDisclosure")}</p>
      </div>

      <section className="rounded-2xl border border-border/60 bg-muted/20 p-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase leading-none tracking-[0.08em] text-muted-foreground">
              {t("copy.tripSavingsTarget", { currency: idea.currency })}
            </p>
            <p className="mt-1.5 text-2xl font-semibold leading-none tabular-nums">
              {targetMinor == null
                ? t("copy.tripSavingsAddTarget")
                : formatMinorUnits(targetMinor, idea.currency, locale)}
            </p>
          </div>
          {progress != null && (
            <p className="text-xs font-medium text-muted-foreground tabular-nums">{progress}%</p>
          )}
        </div>

        {targetMinor != null && (
          <>
            <div aria-hidden className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-viatik-gradient"
                style={{ width: `${progress ?? 0}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">
              {t("copy.tripSavingsProgress", {
                current: formatMinorUnits(currentSavingsMinor, idea.currency, locale),
                target: formatMinorUnits(targetMinor, idea.currency, locale),
              })}
            </p>
          </>
        )}
      </section>

      {!schedule ? (
        <p className="rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">
          {t("copy.tripSavingsNeedDateAndTarget")}
        </p>
      ) : (
        <ol className="space-y-0" aria-label={t("copy.tripSavingsTimelineLabel")}>
          <TimelineStep
            icon={PiggyBank}
            tone="bg-viatik-magenta/15 text-viatik-magenta"
            label={t("copy.tripSavingsStepStart")}
            value={
              schedule.contributionMinor === 0n
                ? t("copy.tripSavingsGoalMet")
                : `${formatMinorUnits(schedule.contributionMinor, idea.currency, locale)} ${t(cadenceKey)}`
            }
            hint={
              schedule.contributionMinor === 0n
                ? undefined
                : [
                    t("copy.tripSavingsStepStartUntil", {
                      date: formatIsoTripDay(schedule.readyOn, locale) ?? schedule.readyOn,
                    }),
                    durationLabel,
                  ]
                    .filter(Boolean)
                    .join(" · ")
            }
          />
          <TimelineStep
            icon={PlaneTakeoff}
            tone="bg-viatik-blue/15 text-viatik-blue"
            label={t("copy.tripSavingsStepBuy")}
            value={t("copy.tripSavingsStepBuyValue", {
              date: formatIsoTripDay(schedule.bookBy, locale) ?? schedule.bookBy,
            })}
            hint={t("copy.tripSavingsStepBuyHint", { days: bookingWindowDays })}
          />
          <TimelineStep
            icon={CalendarClock}
            tone="bg-amber-500/15 text-amber-600 dark:text-amber-400"
            label={t("copy.tripSavingsStepTrip")}
            value={formatTravelWindow(
              { start: schedule.departureStart, end: schedule.departureEnd },
              locale
            )}
            hint={[
              t("copy.tripIdeaDurationDays", { days: schedule.days }),
              schedule.isEstimate ? t("copy.tripSavingsEstimated") : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            last
          />
        </ol>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`current-savings-${idea.id}`}>
            {t("copy.tripSavingsCurrent", { currency: idea.currency })}
          </Label>
          <Input
            id={`current-savings-${idea.id}`}
            className="h-11"
            inputMode="decimal"
            value={currentInput}
            onChange={(event) => setCurrentInput(event.target.value)}
            aria-invalid={Boolean(inputError)}
            aria-describedby={inputError ? `savings-error-${idea.id}` : undefined}
          />
        </div>
        {isNearTerm && (
          <div className="space-y-1.5">
            <p className="text-sm font-medium">{t("copy.tripSavingsCadence")}</p>
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label={t("copy.tripSavingsCadence")}
            >
              <Button
                type="button"
                variant={cadence === "weekly" ? "default" : "outline"}
                aria-pressed={cadence !== "once"}
                onClick={() => setCadence("weekly")}
              >
                {t("copy.tripSavingsWeekly")}
              </Button>
              <Button
                type="button"
                variant={cadence === "once" ? "default" : "outline"}
                aria-pressed={cadence === "once"}
                onClick={() => setCadence("once")}
              >
                {t("copy.tripSavingsOneTime")}
              </Button>
            </div>
          </div>
        )}
      </div>

      {inputError && (
        <p id={`savings-error-${idea.id}`} role="alert" className="text-sm text-destructive">
          {inputError}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving || Boolean(inputError)}
      >
        {saving ? t("copy.tripSavingsSaving") : t("copy.tripSavingsSave")}
      </Button>
    </Card>
  );
}
