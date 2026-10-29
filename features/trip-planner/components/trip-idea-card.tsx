"use client";

import Link from "next/link";
import { ExternalLink, Pencil, Trash2, Undo2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SPENDING_CATEGORY_KEYS,
  type SpendingCategory,
} from "@/features/domain/categories";
import { formatMinorUnits, parseMinorUnits } from "@/features/domain/money";
import type {
  TripIdea,
  TripIdeaPriceCheck,
  TripSavingsPlan,
} from "@/features/trip-planner/domain/trip-planner-types";
import {
  buildGoogleFlightsUrl,
  buildGoogleHotelsUrl,
} from "@/features/trip-planner/domain/google-travel-links";
import { tripSavingsPlanRepository } from "@/features/trip-planner/data/dexie-trip-planner-repository";
import { RevertToIdeaDialog } from "@/features/trip-planner/components/revert-to-idea-dialog";
import { SavingsPlanner } from "@/features/trip-planner/components/savings-planner";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/lib/i18n/translations";

const CATEGORY_COPY_KEYS: Record<SpendingCategory, TranslationKey> = {
  transport: "copy.tripPlannerCategoryTransport",
  stay: "copy.tripPlannerCategoryStay",
  food: "copy.tripPlannerCategoryFood",
  activities: "copy.tripPlannerCategoryActivities",
  shopping: "copy.tripPlannerCategoryShopping",
  personal: "copy.tripPlannerCategoryPersonal",
};

function dateLabel(date: string | null, locale: string): string | null {
  if (!date) return null;
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, day))
  );
}

function monthLabel(month: string, locale: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber) return month;
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, monthNumber - 1, 1))
  );
}

function providerLink(label: string, href: string) {
  return (
    <Button asChild variant="outline">
      <a href={href} target="_blank" rel="noopener noreferrer">
        <ExternalLink aria-hidden />
        {label}
      </a>
    </Button>
  );
}

export function TripIdeaCard({
  idea,
  onEdit,
  onDelete,
  onConvert,
  onRevert,
  onSaveSavings,
  onAddPriceCheck,
  onRemovePriceCheck,
}: {
  idea: TripIdea;
  onEdit: () => void;
  onDelete: () => Promise<void>;
  /** Opens the trip-title prompt; the parent performs the conversion. */
  onConvert: () => void;
  onRevert: (options: { deleteTrip: boolean }) => Promise<void>;
  onSaveSavings: (input: {
    currentSavingsMinor: bigint;
    cadence: TripSavingsPlan["cadence"];
  }) => Promise<void>;
  onAddPriceCheck: (input: Omit<TripIdeaPriceCheck, "id">) => Promise<void>;
  onRemovePriceCheck: (priceCheckId: string) => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const [plan, setPlan] = useState<TripSavingsPlan>();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [revertOpen, setRevertOpen] = useState(false);
  const [priceCategory, setPriceCategory] = useState<SpendingCategory>("transport");
  const [priceInput, setPriceInput] = useState("");
  const [priceSource, setPriceSource] = useState("");
  const [checkedAt, setCheckedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [priceError, setPriceError] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [savingPrice, setSavingPrice] = useState(false);

  useEffect(() => tripSavingsPlanRepository.watchByIdea(idea.id, setPlan), [idea.id]);

  const converted = Boolean(idea.convertedToTripId);

  const estimateTotal = idea.categoryEstimates.reduce(
    (sum, estimate) => sum + estimate.amountMinor,
    0n
  );
  const unallocated =
    idea.targetTripCostMinor == null ? null : idea.targetTripCostMinor - estimateTotal;
  const startLabel = dateLabel(idea.startDate, locale);
  const endLabel = dateLabel(idea.endDate, locale);
  const dates = startLabel && endLabel
    ? `${startLabel} – ${endLabel}`
    : startLabel ?? (idea.targetMonth
      ? `${t("copy.tripIdeaFlexible")} · ${monthLabel(idea.targetMonth, locale)}`
      : t("copy.tripIdeaDatesFlexible"));

  async function savePrice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPriceError(null);
    if (!priceSource.trim()) {
      setPriceError(t("copy.tripIdeaPriceSourceRequired"));
      return;
    }
    let amountMinor: bigint;
    try {
      amountMinor = parseMinorUnits(priceInput, idea.currency);
    } catch {
      setPriceError(t("copy.tripIdeaPriceInvalid", { currency: idea.currency }));
      return;
    }
    setSavingPrice(true);
    try {
      await onAddPriceCheck({
        category: priceCategory,
        amountMinor,
        source: priceSource.trim(),
        checkedAt,
      });
      setPriceInput("");
      setPriceSource("");
    } catch {
      setPriceError(t("copy.tripIdeaPriceSaveError"));
    } finally {
      setSavingPrice(false);
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    try {
      await onDelete();
      setDeleteOpen(false);
    } catch {
      setOperationError(t("copy.tripIdeaRemoveError"));
    } finally {
      setDeleting(false);
    }
  }

  async function removePrice(priceCheckId: string) {
    setPriceError(null);
    try {
      await onRemovePriceCheck(priceCheckId);
    } catch {
      setPriceError(t("copy.tripIdeaPriceRemoveError"));
    }
  }

  return (
    <Card className="space-y-4 p-5">
      {operationError && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {operationError}
        </p>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{idea.name}</h2>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                converted ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
              )}
            >
              {t(converted ? "copy.tripIdeaStatusPlanned" : "copy.tripIdeaStatusIdea")}
            </span>
          </div>
          <p className="mt-1 text-sm font-medium">{idea.destination}</p>
          <dl className="mt-3 grid gap-x-5 gap-y-1 text-sm text-muted-foreground sm:grid-cols-2">
            <div>
              <dt className="inline">{t("copy.tripIdeaDeparting")} </dt>
              <dd className="inline">{idea.origin || t("copy.tripIdeaNotSet")}</dd>
            </div>
            <div>
              <dt className="inline">{t("copy.tripIdeaWhen")} </dt>
              <dd className="inline">{dates}</dd>
            </div>
            <div>
              <dt className="inline">{t("copy.tripIdeaTravelersLabel")} </dt>
              <dd className="inline">
                {idea.childCount
                  ? t("copy.tripIdeaTravelers", { adults: idea.adultCount, children: idea.childCount })
                  : t("copy.tripIdeaTravelersAdults", { adults: idea.adultCount })}
              </dd>
            </div>
            <div>
              <dt className="inline">{t("copy.tripIdeaDuration")} </dt>
              <dd className="inline">
                {idea.durationDays
                  ? t("copy.tripIdeaDurationDays", { days: idea.durationDays })
                  : t("copy.tripIdeaFlexible")}
              </dd>
            </div>
          </dl>
          {idea.interests.length > 0 && (
            <p className="mt-2 text-sm text-muted-foreground">
              {t("copy.tripIdeaInterests", { interests: idea.interests.join(", ") })}
            </p>
          )}
          {converted && (
            <p className="mt-3 text-sm text-muted-foreground">
              {t("copy.tripIdeaConvertedNote")}
            </p>
          )}
          {!converted && idea.targetTripCostMinor != null && (
            <p className="mt-3 font-semibold tabular-nums">
              {t("copy.tripIdeaTarget", {
                amount: formatMinorUnits(idea.targetTripCostMinor, idea.currency),
                currency: idea.currency,
              })}
            </p>
          )}
          {!converted && idea.categoryEstimates.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
              {idea.categoryEstimates.map((estimate) => (
                <li key={estimate.category} className="rounded-full bg-muted px-2.5 py-1">
                  {t(CATEGORY_COPY_KEYS[estimate.category])}{" "}
                  {formatMinorUnits(estimate.amountMinor, idea.currency)}
                </li>
              ))}
            </ul>
          )}
          {!converted && unallocated != null && unallocated !== 0n && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t(unallocated > 0n ? "copy.tripIdeaUnallocated" : "copy.tripIdeaOverAllocated", {
                amount: formatMinorUnits(unallocated > 0n ? unallocated : -unallocated, idea.currency),
              })}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {!converted && (
            <Button type="button" variant="outline" onClick={onEdit}>
              <Pencil aria-hidden />
              {t("copy.tripIdeaEdit")}
            </Button>
          )}
          {idea.convertedToTripId ? (
            <>
              <Button asChild>
                <Link href={`/trips/${encodeURIComponent(idea.convertedToTripId)}`}>{t("copy.tripIdeaOpenTrip")}</Link>
              </Button>
              <Button type="button" variant="outline" onClick={() => setRevertOpen(true)}>
                <Undo2 aria-hidden />
                {t("copy.tripIdeaSetBack")}
              </Button>
            </>
          ) : (
            <Button type="button" onClick={onConvert}>
              {t("copy.tripIdeaPlanTrip")}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("copy.tripIdeaDeleteAria", { name: idea.name })}
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 aria-hidden />
          </Button>
        </div>
      </div>

      {!converted && (
      <Collapsible title={t("copy.tripIdeaSavingsSection")} id={`idea-savings-${idea.id}`}>
        <SavingsPlanner
          key={`${idea.id}-${idea.startDate}-${idea.targetTripCostMinor ?? "unset"}-${plan?.version ?? 0}`}
          idea={idea}
          plan={plan}
          onSave={onSaveSavings}
        />
      </Collapsible>
      )}

      {!converted && (
      <Collapsible title={t("copy.tripIdeaPricesSection")} id={`idea-prices-${idea.id}`}>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("copy.tripIdeaPriceDisclosure")}
          </p>
          <div className="flex flex-wrap gap-2">
            {providerLink(
              t("copy.tripIdeaSearchFlights"),
              buildGoogleFlightsUrl({
                origin: idea.origin,
                destination: idea.destination,
                startDate: idea.startDate,
              })
            )}
            {providerLink(t("copy.tripIdeaSearchHotels"), buildGoogleHotelsUrl(idea.destination))}
          </div>
          <form
            onSubmit={(event) => void savePrice(event)}
            className="grid gap-3 rounded-xl border border-border/60 bg-muted/20 p-4 sm:grid-cols-2"
          >
            <div className="space-y-1.5">
              <Label htmlFor={`price-category-${idea.id}`}>{t("copy.tripIdeaPriceCategory")}</Label>
              <select
                id={`price-category-${idea.id}`}
                value={priceCategory}
                onChange={(event) => setPriceCategory(event.target.value as SpendingCategory)}
                className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {SPENDING_CATEGORY_KEYS.map((category) => (
                  <option key={category} value={category}>
                    {t(CATEGORY_COPY_KEYS[category])}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`price-amount-${idea.id}`}>
                {t("copy.tripIdeaPriceFound", { currency: idea.currency })}
              </Label>
              <Input
                className="h-11"
                id={`price-amount-${idea.id}`}
                inputMode="decimal"
                value={priceInput}
                onChange={(event) => setPriceInput(event.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`price-source-${idea.id}`}>{t("copy.tripIdeaSource")}</Label>
              <Input
                className="h-11"
                id={`price-source-${idea.id}`}
                value={priceSource}
                onChange={(event) => setPriceSource(event.target.value)}
                maxLength={120}
                placeholder={t("copy.tripIdeaSourcePlaceholder")}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`price-date-${idea.id}`}>{t("copy.tripIdeaCheckedOn")}</Label>
              <Input
                className="h-11"
                id={`price-date-${idea.id}`}
                type="date"
                value={checkedAt}
                onChange={(event) => setCheckedAt(event.target.value)}
                required
              />
            </div>
            {priceError && (
              <p role="alert" className="text-sm text-destructive sm:col-span-2">
                {priceError}
              </p>
            )}
            <div className="sm:col-span-2">
              <Button type="submit" disabled={savingPrice}>
                {savingPrice ? t("copy.tripIdeaSavingPrice") : t("copy.tripIdeaLogPrice")}
              </Button>
            </div>
          </form>
          {idea.priceChecks.length > 0 ? (
            <ul className="space-y-2" aria-label={t("copy.tripIdeaPriceList")}>
              {idea.priceChecks.map((check) => (
                <li
                  key={check.id}
                  className="flex flex-col gap-2 rounded-xl border border-border/50 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <p className="text-sm">
                    <span className="font-semibold">
                      {t(CATEGORY_COPY_KEYS[check.category])}:
                    </span>{" "}
                    {formatMinorUnits(check.amountMinor, idea.currency)} · {check.source} ·{" "}
                    {dateLabel(check.checkedAt, locale)}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void removePrice(check.id)}
                  >
                    {t("copy.tripIdeaRemovePrice")}
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t("copy.tripIdeaNoPrices")}</p>
          )}
        </div>
      </Collapsible>
      )}

      <RevertToIdeaDialog open={revertOpen} onOpenChange={setRevertOpen} onRevert={onRevert} />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("copy.tripIdeaDeleteTitle")}</DialogTitle>
            <DialogDescription>{t("copy.tripIdeaDeleteDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>
              {t("copy.tripIdeaKeep")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={() => void confirmDelete()}
            >
              {deleting ? t("copy.tripIdeaDeleting") : t("copy.tripIdeaDelete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
