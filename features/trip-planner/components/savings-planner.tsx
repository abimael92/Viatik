"use client";

import { differenceInCalendarDays, isValid, parseISO } from "date-fns";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MinorUnits } from "@/features/domain/money";
import { decimalFromMinorUnits, formatMinorUnits, parseMinorUnits } from "@/features/domain/money";
import type { TripIdea, TripSavingsPlan } from "@/features/trip-planner/domain/trip-planner-types";
import { calculateSavingsSuggestion } from "@/features/trip-planner/domain/savings-calculator";
import { useI18n } from "@/lib/i18n/i18n-provider";

export function SavingsPlanner({
  idea,
  plan,
  onSave,
}: {
  idea: TripIdea;
  plan: TripSavingsPlan | undefined;
  onSave: (input: {
    currentSavingsMinor: MinorUnits;
    cadence: TripSavingsPlan["cadence"];
  }) => Promise<void>;
}) {
  const { t } = useI18n();
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

  const suggestion = inputError
    ? null
    : calculateSavingsSuggestion({
        tripStartDate: idea.startDate,
        targetTripCostMinor: idea.targetTripCostMinor,
        currentSavingsMinor,
        cadence,
      });
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

  return (
    <Card className="space-y-4 p-5" aria-labelledby={`savings-heading-${idea.id}`}>
      <div>
        <h3 id={`savings-heading-${idea.id}`} className="text-base font-semibold">
          {t("copy.tripSavingsHeading")}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">{t("copy.tripSavingsDisclosure")}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <p id={`savings-goal-label-${idea.id}`} className="text-sm font-semibold">
            {t("copy.tripSavingsTarget", { currency: idea.currency })}
          </p>
          <output
            aria-labelledby={`savings-goal-label-${idea.id}`}
            className="flex min-h-11 items-center rounded-md border border-border/60 bg-muted/40 px-3 font-semibold tabular-nums"
          >
            {idea.targetTripCostMinor == null
              ? t("copy.tripSavingsAddTarget")
              : formatMinorUnits(idea.targetTripCostMinor, idea.currency)}
          </output>
        </div>
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
            aria-describedby={inputError ? `savings-error-${idea.id}` : `savings-help-${idea.id}`}
          />
        </div>
      </div>
      {isNearTerm && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("copy.tripSavingsCadence")}>
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
      )}
      {inputError ? (
        <p id={`savings-error-${idea.id}`} role="alert" className="text-sm text-destructive">
          {inputError}
        </p>
      ) : (
        <p
          id={`savings-help-${idea.id}`}
          role="status"
          aria-live="polite"
          className="rounded-xl bg-muted/40 p-3 text-sm"
        >
          {suggestion?.status === "due-now"
            ? t("copy.tripSavingsDueNow", {
                amount: formatMinorUnits(suggestion.amountMinor, idea.currency),
              })
            : suggestion?.status === "scheduled" && suggestion.cadence === "once"
              ? t("copy.tripSavingsSuggestedOneTime", {
                  amount: formatMinorUnits(suggestion.contributionMinor, idea.currency),
                })
              : suggestion?.status === "scheduled" && suggestion.cadence === "monthly"
                ? t("copy.tripSavingsSuggestedMonthly", {
                    amount: formatMinorUnits(suggestion.contributionMinor, idea.currency),
                  })
                : suggestion?.status === "scheduled"
                  ? t("copy.tripSavingsSuggestedWeekly", {
                      amount: formatMinorUnits(suggestion.contributionMinor, idea.currency),
                    })
                  : t("copy.tripSavingsNeedDateAndTarget")}
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
