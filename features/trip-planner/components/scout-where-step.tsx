"use client";

import { Sparkles } from "lucide-react";

import { DestinationField } from "@/features/trips/components/destination-field";
import type { PlaceDetails } from "@/app/actions/places";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { cn } from "@/lib/utils";

/**
 * The wizard's first question: pin an exact place through Places autocomplete,
 * or stay in "surprise me" idea mode. An empty answer is a valid answer.
 */
export function ScoutWhereStep({
  destination,
  onDestinationChange,
  onPlaceSelect,
  onSurprise,
  error,
  fieldId = "scout-destination",
}: {
  destination: string;
  onDestinationChange: (value: string) => void;
  onPlaceSelect: (details: PlaceDetails) => void;
  onSurprise: () => void;
  error?: string;
  fieldId?: string;
}) {
  const { t } = useI18n();
  const surprised = !destination.trim();

  return (
    <section className="space-y-4" aria-labelledby="scout-where-question">
      <DestinationField
        id={fieldId}
        value={destination}
        onChange={onDestinationChange}
        onPlaceSelect={onPlaceSelect}
        label={t("copy.scoutWizardWhereLabel")}
        placeholder={t("copy.scoutWizardWherePlaceholder")}
        helpText={t("copy.scoutWizardWhereFieldHelp")}
        error={error}
      />
      <button
        type="button"
        aria-pressed={surprised}
        onClick={onSurprise}
        className={cn(
          "flex min-h-11 w-full cursor-pointer items-start gap-3 rounded-xl border border-border/80 bg-card/60 p-4 text-left transition-all duration-200 ease-out hover:border-primary/50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          surprised && "border-primary bg-primary/5 shadow-sm ring-2 ring-primary"
        )}
      >
        <span
          aria-hidden
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-lg",
            surprised ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
          )}
        >
          <Sparkles className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold leading-snug">
            {t("copy.scoutWizardSurpriseMe")}
          </span>
          <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
            {t("copy.scoutWizardSurpriseMeSubtitle")}
          </span>
        </span>
      </button>
    </section>
  );
}
