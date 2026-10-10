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
    inputError = "Enter a valid amount in the trip currency.";
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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save the savings plan.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-4 p-5" aria-labelledby={`savings-heading-${idea.id}`}>
      <div>
        <h3 id={`savings-heading-${idea.id}`} className="text-base font-semibold">
          Savings plan
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">A private plan for this device.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <p id={`savings-goal-label-${idea.id}`} className="text-sm font-semibold">
            Trip target ({idea.currency})
          </p>
          <output
            aria-labelledby={`savings-goal-label-${idea.id}`}
            className="flex min-h-11 items-center rounded-md border border-border/60 bg-muted/40 px-3 font-semibold tabular-nums"
          >
            {idea.targetTripCostMinor == null
              ? "Add a target cost"
              : formatMinorUnits(idea.targetTripCostMinor, idea.currency)}
          </output>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`current-savings-${idea.id}`}>Current savings ({idea.currency})</Label>
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
        <div className="flex flex-wrap gap-2" role="group" aria-label="Contribution cadence">
          <Button
            type="button"
            variant={cadence === "weekly" ? "default" : "outline"}
            aria-pressed={cadence !== "once"}
            onClick={() => setCadence("weekly")}
          >
            Weekly
          </Button>
          <Button
            type="button"
            variant={cadence === "once" ? "default" : "outline"}
            aria-pressed={cadence === "once"}
            onClick={() => setCadence("once")}
          >
            One-time
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
          {suggestion?.status === "missing-input"
            ? "Add an exact trip start date and target trip cost to see a contribution schedule."
            : suggestion?.status === "due-now"
              ? `Remaining goal due now: ${formatMinorUnits(suggestion.amountMinor, idea.currency)}`
              : `Suggested contribution: ${formatMinorUnits(suggestion!.contributionMinor, idea.currency)}${suggestion!.cadence === "once" ? " one-time" : ` / ${suggestion!.cadence === "monthly" ? "month" : "week"}`}`}
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
        {saving ? "Saving…" : "Save savings plan"}
      </Button>
    </Card>
  );
}
