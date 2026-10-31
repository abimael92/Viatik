"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { draftTripIdea, type TripIdeaDraft } from "@/app/actions/trip-draft";
import { MapPin, StickyNote, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DestinationField } from "@/features/trips/components/destination-field";
import {
  SPENDING_CATEGORY_KEYS,
  type SpendingCategory,
} from "@/features/domain/categories";
import {
  decimalFromMinorUnits,
  formatMinorUnits,
  parseMinorUnits,
  type MinorUnits,
} from "@/features/domain/money";
import { MAX_TRIP_DAYS, getTripDurationError } from "@/features/trips/lib/trip-duration";
import type { PlaceDetails } from "@/app/actions/places";
import type { NewTripIdea, TripIdea } from "@/features/trip-planner/domain/trip-planner-types";
import { extractBestSeason } from "@/features/trip-planner/domain/season-window";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/lib/i18n/translations";

/** The sentence-to-draft helper is parked until the traveler asks for it back. */
const SHOW_DRAFT_SECTION = false;

/** Which tab owns a field, so a failed submit can jump straight to it. */
function tabForField(field: FormField): string {
  if (field === "targetTripCost" || field.startsWith("estimate:")) return "budget";
  if (field === "notes") return "details";
  return "trip";
}

const FORM_TAB =
  "flex h-full min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[11px] font-semibold leading-none text-muted-foreground transition-colors [&_svg]:size-4 hover:text-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-[0_2px_10px_rgba(15,23,42,0.10)] data-[state=active]:ring-1 data-[state=active]:ring-viatik-magenta/30 data-[state=active]:[&_svg]:text-viatik-magenta";

const FORM_PANEL = "mt-3 space-y-4 rounded-2xl border border-border/60 bg-card p-5";

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
  const [tab, setTab] = useState("trip");
  const moneyOrEmpty = (amount: MinorUnits | null | undefined) =>
    amount == null ? "" : decimalFromMinorUnits(amount, currency);
  const [savingsCapacityInput, setSavingsCapacityInput] = useState(() =>
    moneyOrEmpty(idea?.savingsCapacityMinor)
  );
  const [savingsCadence, setSavingsCadence] = useState<"weekly" | "monthly">(
    idea?.savingsCadence ?? "monthly"
  );
  const [tripLength, setTripLength] = useState(idea?.tripLength ?? "any");
  const [constraints, setConstraints] = useState(idea?.constraints ?? "");
  const [flightPerPersonInput, setFlightPerPersonInput] = useState(() =>
    moneyOrEmpty(idea?.flightCostPerPersonMinor)
  );
  const [hotelNightInput, setHotelNightInput] = useState(() =>
    moneyOrEmpty(idea?.hotelPerNightMinor)
  );
  const [rentalNightInput, setRentalNightInput] = useState(() =>
    moneyOrEmpty(idea?.altStayPerNightMinor)
  );
  const [dailyPersonInput, setDailyPersonInput] = useState(() =>
    moneyOrEmpty(idea?.dailyPerPersonMinor)
  );
  const days = Math.max(1, idea?.durationDays ?? 1);
  const converted = Boolean(idea?.convertedToTripId);
  const bestSeason = extractBestSeason(idea?.notes ?? "");
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
      // Jump to the tab that owns the first error so the message is visible.
      setTab(tabForField(firstInvalid));
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
        savingsCapacityMinor: parseOptionalMoney(savingsCapacityInput, currency),
        savingsCadence: savingsCapacityInput.trim() ? savingsCadence : null,
        tripLength,
        constraints: constraints.trim(),
        flightCostPerPersonMinor: parseOptionalMoney(flightPerPersonInput, currency),
        hotelPerNightMinor: parseOptionalMoney(hotelNightInput, currency),
        altStayPerNightMinor: parseOptionalMoney(rentalNightInput, currency),
        dailyPerPersonMinor: parseOptionalMoney(dailyPersonInput, currency),
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

  // The preview must never throw while the traveler is typing an amount.
  let previewTotal: MinorUnits | null = null;
  try {
    previewTotal = parseOptionalMoney(targetInput, currency);
  } catch {
    previewTotal = null;
  }
  const previewDestination = destination.trim();
  const previewMeta = [
    previewTotal == null ? null : formatMinorUnits(previewTotal, currency),
    durationDays.trim()
      ? t("copy.tripIdeaDurationDays", { days: Number(durationDays) })
      : t("copy.tripIdeaFlexible"),
    Number(adultCount) > 0
      ? t("copy.tripIdeaTravelersAdults", { adults: Number(adultCount) })
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="space-y-4 [&_label]:text-[11px] [&_label]:font-semibold [&_label]:uppercase [&_label]:tracking-[0.06em] [&_label]:text-muted-foreground"
      noValidate
    >
      {/* Read-only header, mirroring the idea card so the editor reads as the
          same object instead of a bare form. */}
      <section className="rounded-2xl border border-border/60 bg-gradient-to-br from-viatik-blue/10 via-viatik-magenta/10 to-transparent p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          {t("copy.tripIdeaEditPreview")}
        </p>
        <p className="mt-1 text-lg font-semibold leading-tight">
          {previewDestination || "—"}
        </p>
        <p className="mt-0.5 text-[13px] font-medium tabular-nums text-muted-foreground">
          {previewMeta}
        </p>
      </section>

      {saveError && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {saveError}
        </p>
      )}

      {SHOW_DRAFT_SECTION && (
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
          {draftError && (
            <p role="alert" className="text-sm text-destructive">
              {draftError}
            </p>
          )}
        </section>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid h-auto w-full grid-cols-3 gap-1 rounded-2xl border border-border/60 bg-muted/40 p-1">
          <TabsTrigger value="trip" className={FORM_TAB}>
            <MapPin aria-hidden />
            {t("copy.tripIdeaSectionTrip")}
          </TabsTrigger>
          <TabsTrigger value="budget" className={FORM_TAB}>
            <Wallet aria-hidden />
            {t("copy.tripIdeaTabBudget")}
          </TabsTrigger>
          <TabsTrigger value="details" className={FORM_TAB}>
            <StickyNote aria-hidden />
            {t("copy.tripIdeaTabDetails")}
          </TabsTrigger>
        </TabsList>

        <div role="tabpanel" id={`idea-panel-${tab}`} hidden={tab !== "trip"} className={cn(FORM_PANEL, "border-viatik-blue/25 bg-viatik-blue/5")}>
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
          <div className="space-y-1.5">
            <Label htmlFor="idea-interests">{t("copy.tripIdeaInterestsLabel")}</Label>
            <Input
              ref={(element) => { fieldRefs.current.interests = element ?? undefined; }}
              className="h-11"
              id="idea-interests"
              value={interests}
              maxLength={400}
              onChange={(event) => setInterests(event.target.value)}
              placeholder={t("copy.tripIdeaInterestsPlaceholder")}
              aria-invalid={Boolean(errorMessage("interests"))}
              aria-describedby={errorMessage("interests") ? "idea-interests-error" : undefined}
            />
            {errorMessage("interests") && <p id="idea-interests-error" role="alert" className="text-xs text-destructive">{errorMessage("interests")}</p>}
          </div>
        </div>

        <div role="tabpanel" id={`idea-panel-${tab}`} hidden={tab !== "trip"} className={cn(FORM_PANEL, "border-viatik-blue/25 bg-viatik-blue/5")}>
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
        </div>

        <div role="tabpanel" id={`idea-panel-${tab}`} hidden={tab !== "trip"} className={cn(FORM_PANEL, "border-viatik-blue/25 bg-viatik-blue/5")}>
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
        </div>

        <div role="tabpanel" id={`idea-panel-${tab}`} hidden={tab !== "budget"} className={cn(FORM_PANEL, "border-viatik-magenta/25 bg-viatik-magenta/5")}>
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
          <div className="grid gap-4 sm:grid-cols-2">
            {SPENDING_CATEGORY_KEYS.map((category) => {
              const field = `estimate:${category}` as FormField;
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
          {idea && (
            <div className="grid gap-2 rounded-xl border border-border/60 bg-muted/20 p-3 sm:grid-cols-3">
              {(
                [
                  {
                    key: "food",
                    label: t("copy.tripIdeaFoodPerDay"),
                    amount:
                      (idea.categoryEstimates.find((item) => item.category === "food")
                        ?.amountMinor ?? 0n) / BigInt(days),
                  },
                  {
                    key: "activities",
                    label: t("copy.tripIdeaActivitiesPerDay"),
                    amount:
                      (idea.categoryEstimates.find((item) => item.category === "activities")
                        ?.amountMinor ?? 0n) / BigInt(days),
                  },
                  {
                    key: "daily",
                    label: t("copy.tripIdeaDailyTotal"),
                    amount:
                      idea.dailyPerPersonMinor ??
                      ((idea.categoryEstimates.find((item) => item.category === "food")
                        ?.amountMinor ?? 0n) +
                        (idea.categoryEstimates.find((item) => item.category === "activities")
                          ?.amountMinor ?? 0n)) /
                        BigInt(days) /
                        BigInt(Math.max(1, idea.adultCount)),
                  },
                ] as const
              ).map((row) => (
                <div key={row.key}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    {row.label}
                  </p>
                  <p className="mt-1 text-base font-bold tabular-nums text-foreground">
                    {formatMinorUnits(row.amount, currency)}
                  </p>
                  <p className="text-[13px] text-muted-foreground">
                    {t("copy.tripIdeaDurationDays", { days })}
                  </p>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="idea-notes">{t("copy.tripIdeaNotesLabel")}</Label>
            <textarea
              ref={(element) => { fieldRefs.current.notes = element ?? undefined; }}
              id="idea-notes"
              maxLength={500}
              rows={4}
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

        <div role="tabpanel" id={`idea-panel-${tab}`} hidden={tab !== "details"} className={cn(FORM_PANEL, "border-viatik-magenta/25 bg-viatik-magenta/5")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="idea-savings-capacity">
                {t("copy.tripIdeaScoutPace")} ({currency})
              </Label>
              <Input
                className="h-11"
                id="idea-savings-capacity"
                inputMode="decimal"
                value={savingsCapacityInput}
                onChange={(event) => setSavingsCapacityInput(event.target.value)}
                placeholder={t("copy.tripIdeaOptionalPlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="idea-savings-cadence">{t("copy.tripSavingsCadence")}</Label>
              <select
                id="idea-savings-cadence"
                value={savingsCadence}
                onChange={(event) => setSavingsCadence(event.target.value as "weekly" | "monthly")}
                className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="monthly">{t("copy.tripIdeaPlanMonthPlural")}</option>
                <option value="weekly">{t("copy.tripIdeaPlanWeekPlural")}</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="idea-trip-length">{t("copy.scoutWizardTripLength")}</Label>
              <select
                id="idea-trip-length"
                value={tripLength}
                onChange={(event) => setTripLength(event.target.value as typeof tripLength)}
                className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="any">{t("copy.scoutWizardLengthAny")}</option>
                <option value="weekend">{t("copy.scoutWizardLengthWeekend")}</option>
                <option value="week">{t("copy.scoutWizardLengthWeek")}</option>
                <option value="two-weeks">{t("copy.scoutWizardLengthTwoWeeks")}</option>
              </select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="idea-constraints">{t("copy.tripIdeaScoutConstraints")}</Label>
              <textarea
                id="idea-constraints"
                maxLength={200}
                rows={2}
                value={constraints}
                onChange={(event) => setConstraints(event.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="idea-flight-per-person">
                {t("copy.tripPlannerCategoryTransport")} ({currency})
              </Label>
              <Input
                className="h-11"
                id="idea-flight-per-person"
                inputMode="decimal"
                value={flightPerPersonInput}
                onChange={(event) => setFlightPerPersonInput(event.target.value)}
                placeholder={t("copy.tripIdeaOptionalPlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="idea-hotel-night">
                {t("copy.tripIdeaHotelNight")} ({currency})
              </Label>
              <Input
                className="h-11"
                id="idea-hotel-night"
                inputMode="decimal"
                value={hotelNightInput}
                onChange={(event) => setHotelNightInput(event.target.value)}
                placeholder={t("copy.tripIdeaOptionalPlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="idea-rental-night">
                {t("copy.tripIdeaRentalNight")} ({currency})
              </Label>
              <Input
                className="h-11"
                id="idea-rental-night"
                inputMode="decimal"
                value={rentalNightInput}
                onChange={(event) => setRentalNightInput(event.target.value)}
                placeholder={t("copy.tripIdeaOptionalPlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="idea-daily-person">
                {t("copy.tripIdeaDailyTotal")} ({currency})
              </Label>
              <Input
                className="h-11"
                id="idea-daily-person"
                inputMode="decimal"
                value={dailyPersonInput}
                onChange={(event) => setDailyPersonInput(event.target.value)}
                placeholder={t("copy.tripIdeaOptionalPlaceholder")}
              />
            </div>
          </div>

          {idea && (
            <dl className="space-y-1.5 rounded-xl border border-border/60 bg-muted/20 p-3 text-sm">
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-muted-foreground">{t("copy.tripIdeaScoutStatus")}:</dt>
                <dd className="font-semibold">
                  {t(converted ? "copy.tripIdeaStatusPlanned" : "copy.tripIdeaStatusIdea")}
                </dd>
              </div>
              {bestSeason && (
                <div className="flex flex-wrap gap-x-2">
                  <dt className="text-muted-foreground">{t("copy.tripIdeaScoutSeason")}:</dt>
                  <dd className="font-semibold">{bestSeason}</dd>
                </div>
              )}
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-muted-foreground">{t("copy.tripIdeaScoutRoute")}:</dt>
                <dd className="font-semibold">
                  {idea.flightRoute
                    ? idea.flightRoute.legs
                        .map((leg) => leg.from)
                        .concat(idea.flightRoute.legs.at(-1)?.to ?? "")
                        .join(" → ")
                    : t("copy.tripIdeaNoRoute")}
                </dd>
              </div>
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-muted-foreground">{t("copy.tripIdeaScoutLocation")}:</dt>
                <dd className="font-semibold tabular-nums">
                  {idea.latitude != null && idea.longitude != null
                    ? `${idea.latitude.toFixed(3)}, ${idea.longitude.toFixed(3)}`
                    : t("copy.tripIdeaMapNoCoordinates")}
                </dd>
              </div>
            </dl>
          )}
        </div>

      </Tabs>

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
