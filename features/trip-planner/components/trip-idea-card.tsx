"use client";

import Link from "next/link";
import {
  CalendarDays,
  Clock,
  ExternalLink,
  Pencil,
  PlaneTakeoff,
  Tag,
  Trash2,
  Undo2,
  UsersRound,
} from "lucide-react";
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
  TripIdeaEstimate,
  TripIdeaPriceCheck,
  TripSavingsPlan,
} from "@/features/trip-planner/domain/trip-planner-types";
import {
  buildGoogleFlightsUrl,
  buildGoogleHotelsUrl,
} from "@/features/trip-planner/domain/google-travel-links";
import {
  tripIdeaRepository,
  tripSavingsPlanRepository,
} from "@/features/trip-planner/data/dexie-trip-planner-repository";
import { IdeaMapCard, type IdeaMapCoordinates } from "@/features/trip-planner/components/idea-map-card";
import { RevertToIdeaDialog } from "@/features/trip-planner/components/revert-to-idea-dialog";
import { SavingsPlanner } from "@/features/trip-planner/components/savings-planner";
import { resolveDestinationCoordinates } from "@/app/actions/places";
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

/** One stable color per spending category, shared by the bar and its legend. */
const CATEGORY_BAR_STYLES: Record<SpendingCategory, string> = {
  transport: "bg-viatik-blue",
  stay: "bg-viatik-magenta",
  food: "bg-amber-500",
  activities: "bg-emerald-500",
  shopping: "bg-fuchsia-500",
  personal: "bg-slate-400",
};

function percentageOf(amountMinor: bigint, totalMinor: bigint): number {
  if (totalMinor <= 0n) return 0;
  return Number((amountMinor * 10_000n) / totalMinor) / 100;
}

function BudgetBar({
  estimates,
  totalMinor,
}: {
  estimates: TripIdeaEstimate[];
  totalMinor: bigint;
}) {
  if (totalMinor <= 0n) return null;
  return (
    <div aria-hidden className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-muted">
      {estimates.map((estimate) => (
        <span
          key={estimate.category}
          className={cn("h-full first:rounded-l-full last:rounded-r-full", CATEGORY_BAR_STYLES[estimate.category])}
          style={{ width: `${percentageOf(estimate.amountMinor, totalMinor)}%` }}
        />
      ))}
    </div>
  );
}

function FactTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 px-3 py-2.5">
      <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon aria-hidden className="size-3.5" />
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium leading-snug">{value}</dd>
    </div>
  );
}


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

  // Scout names ideas "<destination> - <season>"; the destination is already the
  // headline, so only the remainder is worth showing as a subtitle.
  const nameSuffix = idea.name.toLowerCase().startsWith(idea.destination.toLowerCase())
    ? idea.name.slice(idea.destination.length).replace(/^[\s\-–—·:]+/, "").trim()
    : "";
  const subtitle = nameSuffix || (idea.name !== idea.destination ? idea.name : "");

  const travelers = idea.childCount
    ? t("copy.tripIdeaTravelers", { adults: idea.adultCount, children: idea.childCount })
    : t("copy.tripIdeaTravelersAdults", { adults: idea.adultCount });

  const budgetTotal = idea.targetTripCostMinor ?? estimateTotal;

  async function locate(): Promise<IdeaMapCoordinates | null> {
    try {
      const coordinates = await resolveDestinationCoordinates(idea.destination);
      if (!coordinates) return null;
      await tripIdeaRepository.updateIdea(idea.id, {
        placeId: coordinates.placeId,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        timeZone: coordinates.timeZone,
      });
      return { latitude: coordinates.latitude, longitude: coordinates.longitude };
    } catch {
      return null;
    }
  }

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
    <Card className="overflow-hidden">
      <div
        aria-hidden
        className={cn("h-1 w-full", converted ? "bg-success/70" : "bg-viatik-gradient")}
      />

      <div className="space-y-4 p-5">
        {operationError && (
          <p
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {operationError}
          </p>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  converted ? "bg-success/10 text-success" : "bg-viatik-magenta/10 text-viatik-magenta"
                )}
              >
                {t(converted ? "copy.tripIdeaStatusPlanned" : "copy.tripIdeaStatusIdea")}
              </span>
              {idea.durationDays != null && (
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {t("copy.tripIdeaDurationDays", { days: idea.durationDays })}
                </span>
              )}
            </div>
            <h2 className="text-xl font-semibold leading-tight tracking-tight">
              {idea.destination}
            </h2>
            {subtitle && (
              <p className="text-sm leading-snug text-muted-foreground">{subtitle}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!converted && (
              <Button type="button" variant="outline" onClick={onEdit}>
                <Pencil aria-hidden />
                {t("copy.tripIdeaEdit")}
              </Button>
            )}
            {idea.convertedToTripId ? (
              <>
                <Button asChild>
                  <Link href={`/trips/${encodeURIComponent(idea.convertedToTripId)}`}>
                    {t("copy.tripIdeaOpenTrip")}
                  </Link>
                </Button>
                <Button type="button" variant="outline" onClick={() => setRevertOpen(true)}>
                  <Undo2 aria-hidden />
                  {t("copy.tripIdeaSetBack")}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                className="bg-viatik-gradient text-white transition-all duration-200 ease-out active:scale-[0.98]"
                onClick={onConvert}
              >
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

        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <FactTile
            icon={PlaneTakeoff}
            label={t("copy.tripIdeaFactOrigin")}
            value={idea.origin || t("copy.tripIdeaNotSet")}
          />
          <FactTile icon={CalendarDays} label={t("copy.tripIdeaFactWhen")} value={dates} />
          <FactTile icon={UsersRound} label={t("copy.tripIdeaFactTravelers")} value={travelers} />
          <FactTile
            icon={Clock}
            label={t("copy.tripIdeaFactDuration")}
            value={
              idea.durationDays
                ? t("copy.tripIdeaDurationDays", { days: idea.durationDays })
                : t("copy.tripIdeaFlexible")
            }
          />
        </dl>

        {idea.interests.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {idea.interests.map((interest) => (
              <li
                key={interest}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-2.5 py-1 text-xs text-muted-foreground"
              >
                <Tag aria-hidden className="size-3" />
                {interest}
              </li>
            ))}
          </ul>
        )}

        {converted ? (
          <p className="text-sm text-muted-foreground">{t("copy.tripIdeaConvertedNote")}</p>
        ) : (
          <section className="rounded-2xl border border-border/60 bg-muted/20 p-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("copy.tripIdeaBudgetHeading")}
                </p>
                <p className="mt-1 text-2xl font-semibold leading-none tracking-tight tabular-nums">
                  {idea.targetTripCostMinor != null || estimateTotal > 0n
                    ? formatMinorUnits(budgetTotal, idea.currency, locale)
                    : t("copy.tripIdeaBudgetUnset")}
                </p>
              </div>
              {unallocated != null && unallocated !== 0n && (
                <span className="rounded-full bg-card px-2.5 py-1 text-xs text-muted-foreground tabular-nums">
                  {t(unallocated > 0n ? "copy.tripIdeaUnallocated" : "copy.tripIdeaOverAllocated", {
                    amount: formatMinorUnits(
                      unallocated > 0n ? unallocated : -unallocated,
                      idea.currency,
                      locale
                    ),
                  })}
                </span>
              )}
            </div>

            {idea.categoryEstimates.length > 0 && (
              <>
                <BudgetBar estimates={idea.categoryEstimates} totalMinor={budgetTotal} />
                <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t("copy.tripIdeaBudgetBreakdown")}
                </p>
                <ul className="mt-2 grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
                  {idea.categoryEstimates.map((estimate) => (
                    <li key={estimate.category} className="flex items-center gap-2 text-xs">
                      <span
                        aria-hidden
                        className={cn("size-2 shrink-0 rounded-full", CATEGORY_BAR_STYLES[estimate.category])}
                      />
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">
                        {t(CATEGORY_COPY_KEYS[estimate.category])}
                      </span>
                      <span className="font-medium tabular-nums">
                        {formatMinorUnits(estimate.amountMinor, idea.currency, locale)}
                      </span>
                      <span className="w-9 shrink-0 text-right text-muted-foreground tabular-nums">
                        {Math.round(percentageOf(estimate.amountMinor, budgetTotal))}%
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}

        {!converted && (
          <IdeaMapCard
            destination={idea.destination}
            latitude={idea.latitude}
            longitude={idea.longitude}
            onResolveLocation={locate}
          />
        )}
      </div>

      {!converted && (
        <div className="space-y-3 border-t border-border/60 bg-muted/10 p-5">
          <Collapsible title={t("copy.tripIdeaSavingsSection")} id={`idea-savings-${idea.id}`}>
            <SavingsPlanner
              key={`${idea.id}-${idea.startDate}-${idea.targetTripCostMinor ?? "unset"}-${plan?.version ?? 0}`}
              idea={idea}
              plan={plan}
              onSave={onSaveSavings}
            />
          </Collapsible>

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
        </div>
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
