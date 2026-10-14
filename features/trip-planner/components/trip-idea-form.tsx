"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { draftTripIdea, type TripIdeaDraft } from "@/app/actions/trip-draft";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DestinationField } from "@/features/trips/components/destination-field";
import {
  SPENDING_CATEGORY_KEYS,
  type SpendingCategory,
} from "@/features/domain/categories";
import {
  decimalFromMinorUnits,
  parseMinorUnits,
  type MinorUnits,
} from "@/features/domain/money";
import { MAX_TRIP_DAYS, getTripDurationError } from "@/features/trips/lib/trip-duration";
import type { PlaceDetails } from "@/app/actions/places";
import type { NewTripIdea, TripIdea } from "@/features/trip-planner/domain/trip-planner-types";
import { useI18n } from "@/lib/i18n/i18n-provider";
import type { TranslationKey } from "@/lib/i18n/translations";

const CATEGORY_COPY_KEYS: Record<SpendingCategory, TranslationKey> = {
  transport: "copy.tripPlannerCategoryTransport",
  stay: "copy.tripPlannerCategoryStay",
  food: "copy.tripPlannerCategoryFood",
  activities: "copy.tripPlannerCategoryActivities",
  shopping: "copy.tripPlannerCategoryShopping",
  personal: "copy.tripPlannerCategoryPersonal",
};

type FormField =
  | "name"
  | "origin"
  | "destination"
  | "startDate"
  | "endDate"
  | "targetMonth"
  | "durationDays"
  | "adultCount"
  | "childCount"
  | "interests"
  | "targetTripCost"
  | "notes"
  | `estimate:${SpendingCategory}`;

type FieldErrors = Partial<Record<FormField, string>>;

function initialEstimates(idea?: TripIdea): Record<SpendingCategory, string> {
  const values = Object.fromEntries(
    SPENDING_CATEGORY_KEYS.map((category) => [category, ""])
  ) as Record<SpendingCategory, string>;
  if (idea) {
    for (const estimate of idea.categoryEstimates) {
      values[estimate.category] = decimalFromMinorUnits(estimate.amountMinor, idea.currency);
    }
  }
  return values;
}

function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseOptionalMoney(value: string, currency: string): MinorUnits | null {
  return value.trim() ? parseMinorUnits(value, currency) : null;
}

export function TripIdeaForm({
  idea,
  currency,
  onSave,
  onCancel,
}: {
  idea?: TripIdea;
  currency: string;
  onSave: (input: NewTripIdea) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(idea?.name ?? "");
  const [origin, setOrigin] = useState(idea?.origin ?? "");
  const [destination, setDestination] = useState(idea?.destination ?? "");
  const [placeId, setPlaceId] = useState(idea?.placeId ?? null);
  const [latitude, setLatitude] = useState<number | null>(idea?.latitude ?? null);
  const [longitude, setLongitude] = useState<number | null>(idea?.longitude ?? null);
  const [timeZone, setTimeZone] = useState(idea?.timeZone ?? null);
  const [startDate, setStartDate] = useState(idea?.startDate ?? "");
  const [endDate, setEndDate] = useState(idea?.endDate ?? "");
  const [targetMonth, setTargetMonth] = useState(idea?.targetMonth ?? "");
  const [durationDays, setDurationDays] = useState(idea?.durationDays?.toString() ?? "");
  const [adultCount, setAdultCount] = useState(idea?.adultCount.toString() ?? "1");
  const [childCount, setChildCount] = useState(idea?.childCount.toString() ?? "0");
  const [interests, setInterests] = useState(idea?.interests.join(", ") ?? "");
  const [notes, setNotes] = useState(idea?.notes ?? "");
  const [targetInput, setTargetInput] = useState(
    idea?.targetTripCostMinor == null
      ? ""
      : decimalFromMinorUnits(idea.targetTripCostMinor, currency)
  );
  const [estimateInputs, setEstimateInputs] = useState(() => initialEstimates(idea));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [draftSentence, setDraftSentence] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [budgetExpanded, setBudgetExpanded] = useState(false);
  const [budgetPanelKey, setBudgetPanelKey] = useState(0);
  const fieldRefs = useRef<Partial<Record<FormField, HTMLInputElement | HTMLTextAreaElement>>>({});
  const focusSequence = useRef(0);
  const [focusRequest, setFocusRequest] = useState<{ field: FormField; sequence: number } | null>(
    null
  );

  useEffect(() => {
    if (focusRequest) fieldRefs.current[focusRequest.field]?.focus();
  }, [focusRequest]);

  function handleDestinationChange(value: string) {
    setDestination(value);
    setPlaceId(null);
    setLatitude(null);
    setLongitude(null);
    setTimeZone(null);
  }

  function handlePlaceSelect(details: PlaceDetails) {
    setDestination(details.label);
    setPlaceId(details.placeId);
    setLatitude(details.latitude);
    setLongitude(details.longitude);
    setTimeZone(details.timeZone);
  }

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    const trimmedName = name.trim();
    const trimmedDestination = destination.trim();
    const trimmedOrigin = origin.trim();

    if (!trimmedName) errors.name = t("copy.tripIdeaNameRequired");
    else if (trimmedName.length > 120) errors.name = t("copy.tripIdeaNameTooLong");
    if (trimmedOrigin.length > 120) errors.origin = t("copy.tripIdeaOriginTooLong");
    if (!trimmedDestination) errors.destination = t("copy.tripIdeaDestinationRequired");
    else if (trimmedDestination.length > 120) {
      errors.destination = t("copy.tripIdeaDestinationTooLong");
    }

    if (startDate && !isDateOnly(startDate)) errors.startDate = t("copy.tripIdeaDatesInvalid");
    if (endDate && !isDateOnly(endDate)) errors.endDate = t("copy.tripIdeaDatesInvalid");
    if (!errors.startDate && !errors.endDate && startDate && endDate) {
      const dateError = getTripDurationError(startDate, endDate);
      if (dateError === "End date must be on or after the start date.") {
        errors.endDate = t("copy.tripIdeaEndBeforeStart");
      } else if (dateError?.startsWith("Trips can be up to")) {
        errors.endDate = t("copy.tripIdeaTripTooLong", { max: MAX_TRIP_DAYS });
      } else if (dateError) {
        errors.endDate = t("copy.tripIdeaDatesInvalid");
      }
    }
    if (targetMonth && !/^\d{4}-(0[1-9]|1[0-2])$/.test(targetMonth)) {
      errors.targetMonth = t("copy.tripIdeaMonthInvalid");
    }

    if (durationDays.trim()) {
      const value = Number(durationDays);
      if (!Number.isInteger(value)) errors.durationDays = t("copy.tripIdeaDurationInteger");
      else if (value < 1 || value > 60) errors.durationDays = t("copy.tripIdeaDurationRange");
    }

    const adults = Number(adultCount);
    if (!Number.isInteger(adults)) errors.adultCount = t("copy.tripIdeaAdultInteger");
    else if (adults < 1 || adults > 20) errors.adultCount = t("copy.tripIdeaAdultRange");

    const children = Number(childCount);
    if (!Number.isInteger(children)) errors.childCount = t("copy.tripIdeaChildInteger");
    else if (children < 0 || children > 20) errors.childCount = t("copy.tripIdeaChildRange");

    const interestValues = interests
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    if (interestValues.some((item) => item.length > 60)) {
      errors.interests = t("copy.tripIdeaInterestTooLong");
    } else if (interestValues.length > 12) {
      errors.interests = t("copy.tripIdeaTooManyInterests");
    }
    if (notes.length > 500) errors.notes = t("copy.tripIdeaNotesTooLong");

    try {
      parseOptionalMoney(targetInput, currency);
    } catch {
      errors.targetTripCost = t("copy.tripIdeaMoneyInvalid", { currency });
    }
    for (const category of SPENDING_CATEGORY_KEYS) {
      try {
        parseOptionalMoney(estimateInputs[category], currency);
      } catch {
        errors[`estimate:${category}`] = t("copy.tripIdeaMoneyInvalid", { currency });
      }
    }
    return errors;
  }

  async function handleDraft() {
    setDraftError(null);
    setDrafting(true);
    try {
      const result = await draftTripIdea(draftSentence);
      if (!result.success) {
        const reasonKey: Record<typeof result.reason, TranslationKey> = {
          authentication: "copy.tripIdeaDraftAuthError",
          unconfigured: "copy.tripIdeaDraftMissingConfig",
          "invalid-input": "copy.tripIdeaDraftInvalidInput",
          "invalid-output": "copy.tripIdeaDraftInvalidOutput",
          unavailable: "copy.tripIdeaDraftUnavailable",
        };
        setDraftError(t(reasonKey[result.reason]));
        return;
      }
      applyDraft(result.draft);
    } catch {
      setDraftError(t("copy.tripIdeaDraftUnavailable"));
    } finally {
      setDrafting(false);
    }
  }

  function applyDraft(draft: TripIdeaDraft) {
    if (draft.destination) handleDestinationChange(draft.destination);
    if (draft.start_date) {
      setStartDate(draft.start_date);
      setEndDate(draft.end_date ?? "");
      setTargetMonth("");
    } else if (draft.end_date) {
      setEndDate(draft.end_date);
    }
    if (draft.target_month) {
      setTargetMonth(draft.target_month);
      setStartDate("");
      setEndDate("");
    }
    if (draft.duration != null) setDurationDays(String(draft.duration));
    if (draft.travelers.adults != null) setAdultCount(String(draft.travelers.adults));
    if (draft.travelers.children != null) setChildCount(String(draft.travelers.children));
    if (draft.notes) setNotes(draft.notes);
    setFieldErrors({});
    setSaveError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveError(null);
    const errors = validate();
    setFieldErrors(errors);

    const order: FormField[] = [
      "name",
      "origin",
      "destination",
      "startDate",
      "endDate",
      "targetMonth",
      "durationDays",
      "adultCount",
      "childCount",
      "interests",
      "targetTripCost",
      ...SPENDING_CATEGORY_KEYS.map((category) => `estimate:${category}` as const),
      "notes",
    ];
    const firstInvalid = order.find((field) => errors[field]);
    if (firstInvalid) {
      if (firstInvalid === "targetTripCost" || firstInvalid.startsWith("estimate:")) {
        setBudgetExpanded(true);
        setBudgetPanelKey((key) => key + 1);
      }
      focusSequence.current += 1;
      setFocusRequest({ field: firstInvalid, sequence: focusSequence.current });
      return;
    }

    setSaving(true);
    try {
      const categoryEstimates = SPENDING_CATEGORY_KEYS.flatMap((category) => {
        const amountMinor = parseOptionalMoney(estimateInputs[category], currency);
        return amountMinor === null ? [] : [{ category, amountMinor }];
      });
      await onSave({
        id: idea?.id ?? crypto.randomUUID(),
        name: name.trim(),
        origin: origin.trim(),
        destination: destination.trim(),
        placeId,
        latitude,
        longitude,
        timeZone,
        startDate: startDate || null,
        endDate: endDate || null,
        targetMonth: startDate ? startDate.slice(0, 7) : targetMonth || null,
        durationDays: durationDays.trim() ? Number(durationDays) : null,
        adultCount: Number(adultCount),
        childCount: Number(childCount),
        currency,
        interests: interests
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        notes: notes.trim(),
        targetTripCostMinor: parseOptionalMoney(targetInput, currency),
        categoryEstimates,
      });
    } catch {
      setSaveError(t("copy.tripIdeaSaveError"));
    } finally {
      setSaving(false);
    }
  }

  function errorMessage(field: FormField): string | undefined {
    return fieldErrors[field];
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4" noValidate>
      {saveError && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {saveError}
        </p>
      )}
      <section className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-4">
        <Label htmlFor="idea-draft-sentence">{t("copy.tripIdeaDraftLabel")}</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="idea-draft-sentence"
            className="h-11"
            value={draftSentence}
            maxLength={1000}
            onChange={(event) => setDraftSentence(event.target.value)}
            placeholder={t("copy.tripIdeaDraftPlaceholder")}
            aria-describedby="idea-draft-help"
          />
          <Button
            type="button"
            variant="ai"
            onClick={() => void handleDraft()}
            disabled={drafting || !draftSentence.trim()}
          >
            {drafting ? t("copy.tripIdeaDraftLoading") : t("copy.tripIdeaDraftButton")}
          </Button>
        </div>
        <p id="idea-draft-help" className="text-xs text-muted-foreground">
          {t("copy.tripIdeaDraftDisclosure")}
        </p>
        {draftError && <p role="alert" className="text-sm text-destructive">{draftError}</p>}
      </section>

      <Card className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="idea-name">{t("copy.tripIdeaNameLabel")}</Label>
            <Input
              ref={(element) => { fieldRefs.current.name = element ?? undefined; }}
              className="h-11"
              id="idea-name"
              value={name}
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
              aria-invalid={Boolean(errorMessage("name"))}
              aria-describedby={errorMessage("name") ? "idea-name-error" : undefined}
              required
            />
            {errorMessage("name") && <p id="idea-name-error" role="alert" className="text-xs text-destructive">{errorMessage("name")}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="idea-origin">{t("copy.tripIdeaOriginLabel")}</Label>
            <Input
              ref={(element) => { fieldRefs.current.origin = element ?? undefined; }}
              className="h-11"
              id="idea-origin"
              value={origin}
              maxLength={120}
              onChange={(event) => setOrigin(event.target.value)}
              placeholder={t("copy.tripIdeaOriginPlaceholder")}
              aria-invalid={Boolean(errorMessage("origin"))}
              aria-describedby={errorMessage("origin") ? "idea-origin-error" : undefined}
            />
            {errorMessage("origin") && <p id="idea-origin-error" role="alert" className="text-xs text-destructive">{errorMessage("origin")}</p>}
          </div>
        </div>
        <DestinationField
          value={destination}
          onChange={handleDestinationChange}
          onPlaceSelect={handlePlaceSelect}
          error={errorMessage("destination")}
          inputRef={(element) => { fieldRefs.current.destination = element ?? undefined; }}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="idea-start-date">{t("copy.tripIdeaStartLabel")}</Label>
            <Input
              ref={(element) => { fieldRefs.current.startDate = element ?? undefined; }}
              className="h-11"
              id="idea-start-date"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              aria-invalid={Boolean(errorMessage("startDate"))}
              aria-describedby={errorMessage("startDate") ? "idea-start-error" : undefined}
            />
            {errorMessage("startDate") && <p id="idea-start-error" role="alert" className="text-xs text-destructive">{errorMessage("startDate")}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="idea-end-date">{t("copy.tripIdeaEndLabel")}</Label>
            <Input
              ref={(element) => { fieldRefs.current.endDate = element ?? undefined; }}
              className="h-11"
              id="idea-end-date"
              type="date"
              min={startDate || undefined}
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              aria-invalid={Boolean(errorMessage("endDate"))}
              aria-describedby={errorMessage("endDate") ? "idea-end-error" : undefined}
            />
            {errorMessage("endDate") && <p id="idea-end-error" role="alert" className="text-xs text-destructive">{errorMessage("endDate")}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="idea-target-month">{t("copy.tripIdeaMonthLabel")}</Label>
            <Input
              ref={(element) => { fieldRefs.current.targetMonth = element ?? undefined; }}
              className="h-11"
              id="idea-target-month"
              type="month"
              value={targetMonth}
              onChange={(event) => setTargetMonth(event.target.value)}
              aria-invalid={Boolean(errorMessage("targetMonth"))}
              aria-describedby={errorMessage("targetMonth") ? "idea-month-error" : undefined}
            />
            {errorMessage("targetMonth") && <p id="idea-month-error" role="alert" className="text-xs text-destructive">{errorMessage("targetMonth")}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="idea-duration">{t("copy.tripIdeaDurationLabel")}</Label>
            <Input
              ref={(element) => { fieldRefs.current.durationDays = element ?? undefined; }}
              className="h-11"
              id="idea-duration"
              type="number"
              min={1}
              max={60}
              step={1}
              inputMode="numeric"
              value={durationDays}
              onChange={(event) => setDurationDays(event.target.value)}
              aria-invalid={Boolean(errorMessage("durationDays"))}
              aria-describedby={errorMessage("durationDays") ? "idea-duration-error" : undefined}
            />
            {errorMessage("durationDays") && <p id="idea-duration-error" role="alert" className="text-xs text-destructive">{errorMessage("durationDays")}</p>}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="idea-adults">{t("copy.tripIdeaAdultsLabel")}</Label>
            <Input
              ref={(element) => { fieldRefs.current.adultCount = element ?? undefined; }}
              className="h-11"
              id="idea-adults"
              type="number"
              min={1}
              max={20}
              step={1}
              value={adultCount}
              onChange={(event) => setAdultCount(event.target.value)}
              aria-invalid={Boolean(errorMessage("adultCount"))}
              aria-describedby={errorMessage("adultCount") ? "idea-adults-error" : undefined}
            />
            {errorMessage("adultCount") && <p id="idea-adults-error" role="alert" className="text-xs text-destructive">{errorMessage("adultCount")}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="idea-children">{t("copy.tripIdeaChildrenLabel")}</Label>
            <Input
              ref={(element) => { fieldRefs.current.childCount = element ?? undefined; }}
              className="h-11"
              id="idea-children"
              type="number"
              min={0}
              max={20}
              step={1}
              value={childCount}
              onChange={(event) => setChildCount(event.target.value)}
              aria-invalid={Boolean(errorMessage("childCount"))}
              aria-describedby={errorMessage("childCount") ? "idea-children-error" : undefined}
            />
            {errorMessage("childCount") && <p id="idea-children-error" role="alert" className="text-xs text-destructive">{errorMessage("childCount")}</p>}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="idea-interests">{t("copy.tripIdeaInterestsLabel")}</Label>
          <Input
            ref={(element) => { fieldRefs.current.interests = element ?? undefined; }}
            className="h-11"
            id="idea-interests"
            value={interests}
            onChange={(event) => setInterests(event.target.value)}
            placeholder={t("copy.tripIdeaInterestsPlaceholder")}
            aria-invalid={Boolean(errorMessage("interests"))}
            aria-describedby={errorMessage("interests") ? "idea-interests-error" : undefined}
          />
          {errorMessage("interests") && <p id="idea-interests-error" role="alert" className="text-xs text-destructive">{errorMessage("interests")}</p>}
        </div>
      </Card>

      <Collapsible
        key={budgetPanelKey}
        title={t("copy.tripIdeaBudgetTitle")}
        id={`idea-budget-${idea?.id ?? "new"}`}
        defaultOpen={budgetExpanded}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("copy.tripIdeaEstimateDisclosure", { currency })}
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="idea-target-cost">{t("copy.tripIdeaTargetCostLabel", { currency })}</Label>
            <Input
              ref={(element) => { fieldRefs.current.targetTripCost = element ?? undefined; }}
              className="h-11"
              id="idea-target-cost"
              inputMode="decimal"
              value={targetInput}
              onChange={(event) => setTargetInput(event.target.value)}
              placeholder={t("copy.tripIdeaTargetCostPlaceholder")}
              aria-invalid={Boolean(errorMessage("targetTripCost"))}
              aria-describedby={errorMessage("targetTripCost") ? "idea-target-cost-error" : undefined}
            />
            {errorMessage("targetTripCost") && <p id="idea-target-cost-error" role="alert" className="text-xs text-destructive">{errorMessage("targetTripCost")}</p>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {SPENDING_CATEGORY_KEYS.map((category) => {
              const field = `estimate:${category}` as const;
              const errorId = `idea-estimate-${category}-error`;
              return (
                <div key={category} className="space-y-1.5">
                  <Label htmlFor={`idea-estimate-${category}`}>
                    {t("copy.tripIdeaCategoryEstimateLabel", {
                      category: t(CATEGORY_COPY_KEYS[category]),
                      currency,
                    })}
                  </Label>
                  <Input
                    ref={(element) => { fieldRefs.current[field] = element ?? undefined; }}
                    className="h-11"
                    id={`idea-estimate-${category}`}
                    inputMode="decimal"
                    value={estimateInputs[category]}
                    onChange={(event) =>
                      setEstimateInputs((current) => ({ ...current, [category]: event.target.value }))
                    }
                    placeholder={t("copy.tripIdeaOptionalPlaceholder")}
                    aria-invalid={Boolean(errorMessage(field))}
                    aria-describedby={errorMessage(field) ? errorId : undefined}
                  />
                  {errorMessage(field) && <p id={errorId} role="alert" className="text-xs text-destructive">{errorMessage(field)}</p>}
                </div>
              );
            })}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="idea-notes">{t("copy.tripIdeaNotesLabel")}</Label>
            <textarea
              ref={(element) => { fieldRefs.current.notes = element ?? undefined; }}
              id="idea-notes"
              maxLength={500}
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={t("copy.tripIdeaNotesPlaceholder")}
              aria-invalid={Boolean(errorMessage("notes"))}
              aria-describedby={errorMessage("notes") ? "idea-notes-error" : undefined}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
            {errorMessage("notes") && <p id="idea-notes-error" role="alert" className="text-xs text-destructive">{errorMessage("notes")}</p>}
          </div>
        </div>
      </Collapsible>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("copy.tripIdeaCancel")}
        </Button>
        <Button type="submit" disabled={saving}>
          {saving
            ? t("copy.tripIdeaSaving")
            : idea
              ? t("copy.tripIdeaSaveChanges")
              : t("copy.tripIdeaSave")}
        </Button>
      </div>
    </form>
  );
}
