"use client";

import Link from "next/link";
import {
  CalendarDays,
  ChevronDown,
  Clock,
  Compass,
  ExternalLink,
  LayoutGrid,
  Pencil,
  PiggyBank,
  PlaneTakeoff,
  Tag,
  Trash2,
  Undo2,
  UsersRound,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { extractBestSeason } from "@/features/trip-planner/domain/season-window";
import { formatIsoTripDay } from "@/features/trip-planner/domain/date-format";
import { formatTravelWindow } from "@/features/trip-planner/domain/travel-window";
import { buildIdeaSchedule } from "@/features/trip-planner/domain/idea-schedule";
import { flightBookingWindowDays } from "@/features/trip-planner/domain/flight-booking-window";
import { RevertToIdeaDialog } from "@/features/trip-planner/components/revert-to-idea-dialog";
import { SavingsPlanner } from "@/features/trip-planner/components/savings-planner";
import { useRouteTimeLabel } from "@/features/trip-planner/components/scout-flight-route-view";
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
    <div aria-hidden className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
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

type FactAccent = "blue" | "magenta" | "emerald" | "amber";

/** Static class maps: Tailwind cannot see interpolated class names. */
const FACT_ACCENTS: Record<FactAccent, { tile: string; badge: string; label: string }> = {
  blue: {
    tile: "border-viatik-blue/25 bg-viatik-blue/5",
    badge: "bg-viatik-blue/15 text-viatik-blue",
    label: "text-viatik-blue",
  },
  magenta: {
    tile: "border-viatik-magenta/25 bg-viatik-magenta/5",
    badge: "bg-viatik-magenta/15 text-viatik-magenta",
    label: "text-viatik-magenta",
  },
  emerald: {
    tile: "border-emerald-500/25 bg-emerald-500/5",
    badge: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    label: "text-emerald-700 dark:text-emerald-400",
  },
  amber: {
    tile: "border-amber-500/30 bg-amber-500/5",
    badge: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    label: "text-amber-700 dark:text-amber-400",
  },
};

function FactTile({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
  accent: FactAccent;
}) {
  const styles = FACT_ACCENTS[accent];
  return (
    <div
      className={cn(
        "flex h-full min-h-16 flex-col justify-between gap-1.5 rounded-xl border p-2.5",
        styles.tile
      )}
    >
      <dt className="flex items-center gap-1.5">
        <span
          aria-hidden
          className={cn("grid size-6 shrink-0 place-items-center rounded-md", styles.badge)}
        >
          <Icon className="size-3" />
        </span>
        <span
          className={cn(
            "text-[11px] font-semibold uppercase leading-none tracking-[0.06em]",
            styles.label
          )}
        >
          {label}
        </span>
      </dt>
      <dd className="text-[15px] font-semibold leading-snug break-words text-foreground">{value}</dd>
    </div>
  );
}


function dateLabel(date: string | null, locale: string): string | null {
  return formatIsoTripDay(date, locale);
}

/** Interest chips get a colour per vibe so a scan reads as categories. */
/** Equal-size tab cells: stacked icon + label, never wider than its column. */
/**
 * The Prices tab is parked, not deleted: the manual price-check form and its
 * copy stay wired so it can be switched back on without rewriting anything.
 */
const SHOW_PRICE_TAB = false;

/** Every panel shares one height so switching tabs never resizes the card. */
const TAB_PANEL = "mt-3 h-[23rem] space-y-3 overflow-y-auto pr-1";

const TAB_TRIGGER =
  "flex h-full min-h-14 flex-col items-center justify-center gap-1.5 rounded-xl px-1.5 py-2.5 text-xs font-semibold leading-none text-muted-foreground transition-all duration-200 [&_svg]:size-[18px] [&_svg]:transition-colors hover:text-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-[0_2px_10px_rgba(15,23,42,0.10)] data-[state=active]:ring-1 data-[state=active]:ring-viatik-magenta/30 data-[state=active]:[&_svg]:text-viatik-magenta";

const INTEREST_TONES = {
  beach: "border-viatik-blue/30 bg-viatik-blue/10 text-viatik-blue",
  city: "border-viatik-magenta/30 bg-viatik-magenta/10 text-viatik-magenta",
  nature: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  food: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  default: "border-border/60 bg-muted text-muted-foreground",
} as const;

/** Keyword matcher over the vibe text; Scout writes it in EN or ES. */
function interestTone(text: string): keyof typeof INTEREST_TONES {
  if (/\b(playa|beach|mar|sea|oc[eé]ano|ocean|agua|water|isla|island|surf|sol|sun|costa|coast)\b/i.test(text)) {
    return "beach";
  }
  if (/\b(naturaleza|nature|monta[nñ]a|mountain|sender|hike|bosque|forest|aire|trail|r[ií]o|river)\b/i.test(text)) {
    return "nature";
  }
  if (/\b(comida|food|gastronom|cocina|restaurante|foodie|vino|wine|caf[eé]|coffee|mercado|market)\b/i.test(text)) {
    return "food";
  }
  if (/\b(ciudad|city|urbano|urban|cultura|culture|museo|museum|arte|art|noche|nightlife|calle|street)\b/i.test(text)) {
    return "city";
  }
  return "default";
}

type StatAccent = "blue" | "magenta" | "emerald" | "amber";

const STAT_ACCENTS: Record<StatAccent, string> = {
  blue: "border-viatik-blue/25 bg-viatik-blue/5",
  magenta: "border-viatik-magenta/25 bg-viatik-magenta/5",
  emerald: "border-emerald-500/25 bg-emerald-500/5",
  amber: "border-amber-500/30 bg-amber-500/5",
};

function DetailStat({
  label,
  value,
  hint,
  accent = "blue",
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: StatAccent;
}) {
  return (
    <div className={cn("rounded-xl border p-3", STAT_ACCENTS[accent])}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold leading-tight tabular-nums text-foreground">{value}</p>
      {hint && <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{hint}</p>}
    </div>
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
  const durationLabel = useRouteTimeLabel();
  const reducedMotion = useReducedMotion();
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
  const [budgetSplitOpen, setBudgetSplitOpen] = useState(false);

  useEffect(() => tripSavingsPlanRepository.watchByIdea(idea.id, setPlan), [idea.id]);

  const converted = Boolean(idea.convertedToTripId);

  const estimateTotal = idea.categoryEstimates.reduce(
    (sum, estimate) => sum + estimate.amountMinor,
    0n
  );
  const unallocated =
    idea.targetTripCostMinor == null ? null : idea.targetTripCostMinor - estimateTotal;
  // Scout stores the recommended window as a "Best season: …" line inside the
  // notes and repeats it in the name. Read it from the notes so the card can
  // label it; a manually written name stays an unlabeled subtitle.
  const bestSeason = extractBestSeason(idea.notes);

  // The plan is rebuilt from the answers Scout already collected, so the card
  // quotes the same dates the wizard showed instead of inventing a season.
  const transportMinor =
    idea.categoryEstimates.find((estimate) => estimate.category === "transport")?.amountMinor ?? 0n;
  const farePerPerson =
    idea.adultCount > 0
      ? Number(decimalFromMinorUnits(transportMinor / BigInt(idea.adultCount), idea.currency))
      : 0;
  const schedule = buildIdeaSchedule({
    targetTripCostMinor: idea.targetTripCostMinor,
    savingsCapacityMinor: idea.savingsCapacityMinor,
    savingsCadence: idea.savingsCadence,
    targetMonth: idea.targetMonth,
    startDate: idea.startDate,
    endDate: idea.endDate,
    durationDays: idea.durationDays,
    bookingWindowDays: flightBookingWindowDays(farePerPerson, idea.currency),
  });
  const nameSuffix = idea.name.toLowerCase().startsWith(idea.destination.toLowerCase())
    ? idea.name.slice(idea.destination.length).replace(/^[\s\-–—·:]+/, "").trim()
    : "";
  const subtitle = bestSeason
    ? ""
    : nameSuffix || (idea.name !== idea.destination ? idea.name : "");

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

  const days = Math.max(1, idea.durationDays ?? 1);
  const nights = Math.max(1, days - 1);
  const estimateOf = (category: SpendingCategory) =>
    idea.categoryEstimates.find((estimate) => estimate.category === category)?.amountMinor ?? 0n;
  const transportTotal = estimateOf("transport");
  const stayTotal = estimateOf("stay");
  const foodTotal = estimateOf("food");
  const activitiesTotal = estimateOf("activities");
  const hotelPerNight =
    idea.hotelPerNightMinor ?? (nights > 0 ? stayTotal / BigInt(nights) : 0n);
  const flightPerPerson =
    idea.flightCostPerPersonMinor ??
    (idea.adultCount > 0 ? transportTotal / BigInt(idea.adultCount) : transportTotal);
  const dailyPerPerson =
    idea.dailyPerPersonMinor ??
    (idea.adultCount > 0
      ? (foodTotal + activitiesTotal) / BigInt(days) / BigInt(idea.adultCount)
      : 0n);
  const foodPerDay = days > 0 ? foodTotal / BigInt(days) : 0n;
  const activitiesPerDay = days > 0 ? activitiesTotal / BigInt(days) : 0n;
  const money = (amount: MinorUnits) => formatMinorUnits(amount, idea.currency, locale);

  // The grid must match how many triggers actually render, or the last cell
  // leaves an empty column and the row looks lopsided.
  const visibleTabs = converted ? 2 : 3;

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
            <h2 className="text-xl font-semibold leading-tight tracking-tight">
              {idea.destination}
            </h2>
            <div className="flex flex-wrap items-center gap-1.5">
              {/* Status tag ("Idea" / "Planned trip") hidden on request; the
                  gradient rail already signals the card state. */}
              {idea.interests.map((interest) => {
                const tone = INTEREST_TONES[interestTone(interest)];
                return (
                  <span
                    key={interest}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                      tone
                    )}
                  >
                    <Tag aria-hidden className="size-3" />
                    {interest}
                  </span>
                );
              })}
            </div>
            {subtitle && (
              <p className="text-xs leading-snug text-muted-foreground">{subtitle}</p>
            )}
          </div>

          <div className="flex w-full items-center gap-2 sm:w-auto">
            {/* Secondary actions share one segmented control so the row reads
                as a single unit instead of two floating buttons. */}
            <div className="flex flex-1 items-center overflow-hidden rounded-xl border border-border/70 bg-card/70 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:flex-none">
              {!converted && (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-11 flex-1 gap-1.5 rounded-none bg-viatik-blue/5 px-3 text-viatik-blue transition-colors hover:bg-viatik-blue/15 hover:text-viatik-blue sm:flex-none"
                    onClick={onEdit}
                  >
                    <Pencil aria-hidden className="size-4" />
                    {t("copy.tripIdeaEdit")}
                  </Button>
                  <span aria-hidden className="h-5 w-px shrink-0 bg-border/70" />
                </>
              )}
              {converted && (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-11 flex-1 gap-1.5 rounded-none bg-amber-500/5 px-3 text-amber-700 transition-colors hover:bg-amber-500/15 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-400 sm:flex-none"
                    onClick={() => setRevertOpen(true)}
                  >
                    <Undo2 aria-hidden className="size-4" />
                    {t("copy.tripIdeaSetBack")}
                  </Button>
                  <span aria-hidden className="h-5 w-px shrink-0 bg-border/70" />
                </>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="min-h-11 min-w-11 shrink-0 rounded-none bg-destructive/5 text-destructive/80 transition-colors hover:bg-destructive/15 hover:text-destructive"
                aria-label={t("copy.tripIdeaDeleteAria", { name: idea.name })}
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 aria-hidden className="size-4" />
              </Button>
            </div>

            {idea.convertedToTripId ? (
              <Button asChild className="min-h-11 flex-1 sm:flex-none">
                <Link href={`/trips/${encodeURIComponent(idea.convertedToTripId)}`}>
                  {t("copy.tripIdeaOpenTrip")}
                </Link>
              </Button>
            ) : (
              <Button
                type="button"
                className="min-h-11 flex-1 gap-1.5 bg-viatik-gradient text-white shadow-[0_6px_18px_-6px_rgba(168,85,247,0.7)] transition-all duration-200 ease-out hover:brightness-110 active:scale-[0.98] sm:flex-none"
                onClick={onConvert}
              >
                {t("copy.tripIdeaPlanTrip")}
              </Button>
            )}
          </div>
        </div>

        {schedule && (
          <section className="rounded-2xl border border-viatik-magenta/25 bg-gradient-to-br from-viatik-blue/10 via-viatik-magenta/10 to-transparent px-4 py-3">
            <p className="text-[15px] leading-relaxed text-foreground/90">
              {schedule.contributionMinor === 0n ? (
                <span>{t("copy.tripIdeaPlanGoalMet")}</span>
              ) : (
                <>
                  <span>{t("copy.tripIdeaPlanSummaryLead")} </span>
                  <strong className="font-semibold tabular-nums text-foreground">
                    {money(schedule.contributionMinor)}
                  </strong>
                  <span>
                    {" "}
                    {t("copy.tripIdeaPlanSummaryMiddle", {
                      unit: t(
                        schedule.cadence === "weekly"
                          ? "copy.tripIdeaPlanWeek"
                          : "copy.tripIdeaPlanMonth"
                      ),
                      periods: schedule.periods,
                      unitPlural: t(
                        schedule.cadence === "weekly"
                          ? "copy.tripIdeaPlanWeekPlural"
                          : "copy.tripIdeaPlanMonthPlural"
                      ),
                    })}{" "}
                  </span>
                  <strong className="font-semibold text-foreground">
                    {formatTravelWindow(
                      { start: schedule.departureStart, end: schedule.departureEnd },
                      locale
                    )}
                  </strong>
                </>
              )}
            </p>
          </section>
        )}

        <dl className="grid auto-rows-fr grid-cols-2 gap-2 sm:grid-cols-3">
          <FactTile
            icon={PlaneTakeoff}
            label={t("copy.tripIdeaFactOrigin")}
            value={idea.origin || t("copy.tripIdeaNotSet")}
            accent="blue"
          />
          <FactTile
            icon={UsersRound}
            label={t("copy.tripIdeaFactTravelers")}
            value={travelers}
            accent="emerald"
          />
          <FactTile
            icon={Clock}
            label={t("copy.tripIdeaFactDuration")}
            value={
              idea.durationDays
                ? t("copy.tripIdeaDurationDays", { days: idea.durationDays })
                : t("copy.tripIdeaFlexible")
            }
            accent="amber"
          />
        </dl>

        <Tabs defaultValue="overview">
          <TabsList
            className={cn(
              "grid h-auto w-full auto-rows-fr gap-1 rounded-2xl border border-border/60 bg-muted/40 p-1",
              visibleTabs === 2 ? "grid-cols-2" : "grid-cols-3"
            )}
          >
            <TabsTrigger value="overview" className={TAB_TRIGGER}>
              <LayoutGrid aria-hidden />
              {t("copy.tripIdeaTabOverview")}
            </TabsTrigger>
            <TabsTrigger value="details" className={TAB_TRIGGER}>
              <Compass aria-hidden />
              {t("copy.tripIdeaTabDetails")}
            </TabsTrigger>
            {!converted && (
              <TabsTrigger value="savings" className={TAB_TRIGGER}>
                <PiggyBank aria-hidden />
                {t("copy.tripIdeaTabSavings")}
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="overview" className={TAB_PANEL}>
            {converted ? (
              <p className="text-sm text-muted-foreground">{t("copy.tripIdeaConvertedNote")}</p>
            ) : (
              <section className="relative rounded-2xl border border-border/60 bg-muted/20 p-4">
                <button
                  type="button"
                  aria-expanded={budgetSplitOpen}
                  aria-controls={`idea-budget-split-${idea.id}`}
                  aria-label={t("copy.tripIdeaBudgetBreakdown")}
                  onClick={() => setBudgetSplitOpen((open) => !open)}
                  className="absolute right-2 top-2 grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <ChevronDown
                    aria-hidden
                    className={cn(
                      "size-4 transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]",
                      budgetSplitOpen && "rotate-180"
                    )}
                  />
                </button>

                <div className="pr-10">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("copy.tripIdeaBudgetHeading")}
                  </p>
                  <p className="mt-1.5 text-2xl font-semibold leading-none tracking-tight tabular-nums">
                    {idea.targetTripCostMinor != null || estimateTotal > 0n
                      ? money(budgetTotal)
                      : t("copy.tripIdeaBudgetUnset")}
                  </p>
                  {unallocated != null && unallocated !== 0n && (
                    <span className="mt-2 inline-flex rounded-full bg-card px-2.5 py-1 text-xs text-muted-foreground tabular-nums">
                      {t(
                        unallocated > 0n
                          ? "copy.tripIdeaUnallocated"
                          : "copy.tripIdeaOverAllocated",
                        { amount: money(unallocated > 0n ? unallocated : -unallocated) }
                      )}
                    </span>
                  )}
                </div>

                <AnimatePresence initial={false}>
                  {budgetSplitOpen && idea.categoryEstimates.length > 0 && (
                    <motion.div
                      key="budget-split"
                      id={`idea-budget-split-${idea.id}`}
                      initial={reducedMotion ? false : { height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={reducedMotion ? undefined : { height: 0, opacity: 0 }}
                      transition={{ duration: 0.26, ease: [0.23, 1, 0.32, 1] }}
                      className="overflow-hidden"
                    >
                    <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {t("copy.tripIdeaBudgetBreakdown")}
                    </p>
                    <BudgetBar estimates={idea.categoryEstimates} totalMinor={budgetTotal} />
                    <ul className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
                      {idea.categoryEstimates.map((estimate) => (
                        <li key={estimate.category} className="flex items-center gap-2 text-[13px]">
                          <span
                            aria-hidden
                            className={cn(
                              "size-2 shrink-0 rounded-full",
                              CATEGORY_BAR_STYLES[estimate.category]
                            )}
                          />
                          <span className="min-w-0 flex-1 truncate text-muted-foreground">
                            {t(CATEGORY_COPY_KEYS[estimate.category])}
                          </span>
                          <span className="font-medium tabular-nums">
                            {money(estimate.amountMinor)}
                          </span>
                          <span className="w-9 shrink-0 text-right text-muted-foreground tabular-nums">
                            {Math.round(percentageOf(estimate.amountMinor, budgetTotal))}%
                          </span>
                        </li>
                      ))}
                    </ul>
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>
            )}

            <IdeaMapCard
              destination={idea.destination}
              latitude={idea.latitude}
              longitude={idea.longitude}
              onResolveLocation={locate}
            />
          </TabsContent>

          <TabsContent value="details" className={TAB_PANEL}>
            <section className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                {t("copy.tripIdeaTabFlights")}
              </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <DetailStat
                accent="blue"
                label={t("copy.tripPlannerCategoryTransport")}
                value={money(transportTotal)}
                hint={t("copy.tripIdeaPerPerson", { amount: money(flightPerPerson) })}
              />
              <DetailStat
                accent="magenta"
                label={t("copy.tripIdeaRouteHeading")}
                value={
                  idea.flightRoute
                    ? t("copy.scoutRouteStops", {
                        count: Math.max(0, idea.flightRoute.legs.length - 1),
                      })
                    : t("copy.tripIdeaNoRoute")
                }
                hint={
                  idea.flightRoute?.arrivesSameDate
                    ? t("copy.scoutRouteSameDay")
                    : undefined
                }
              />
            </div>

            {idea.flightRoute && (
              <ol className="space-y-2">
                {idea.flightRoute.legs.map((leg, index) => (
                  <li
                    key={`${leg.from}-${leg.to}-${index}`}
                    className="relative rounded-xl border border-border/60 bg-card/60 py-2.5 pl-4 pr-3"
                  >
                    <span
                      aria-hidden
                      className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-viatik-blue/70"
                    />
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <p className="text-[13px] font-semibold leading-snug">
                        {leg.from}
                        <span aria-hidden className="mx-1 text-muted-foreground">
                          →
                        </span>
                        {leg.to}
                      </p>
                      <p className="text-[13px] font-semibold tabular-nums text-muted-foreground">
                        {durationLabel(leg.approxDurationMinutes)}
                      </p>
                    </div>
                    {leg.layoverAfterMinutes > 0 && (
                      <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                        <Clock aria-hidden className="size-3" />
                        {t("copy.scoutRouteLayover", {
                          city: leg.to,
                          duration: durationLabel(leg.layoverAfterMinutes),
                        })}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}

            <div className="flex flex-wrap gap-2">
              {providerLink(
                t("copy.tripIdeaSearchFlights"),
                buildGoogleFlightsUrl({
                  origin: idea.origin,
                  destination: idea.destination,
                  startDate: idea.startDate,
                })
              )}
            </div>
            </section>
            <section className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                {t("copy.tripIdeaTabStay")}
              </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <DetailStat
                accent="magenta"
                label={t("copy.tripIdeaHotelNight")}
                value={money(hotelPerNight)}
                hint={t("copy.tripIdeaNights", { count: nights })}
              />
              <DetailStat
                accent="emerald"
                label={t("copy.tripIdeaRentalNight")}
                value={idea.altStayPerNightMinor != null ? money(idea.altStayPerNightMinor) : "—"}
                hint={t("copy.tripIdeaNights", { count: nights })}
              />
            </div>
            <DetailStat accent="blue" label={t("copy.tripIdeaStayTotal")} value={money(stayTotal)} />
            <div className="flex flex-wrap gap-2">
              {providerLink(t("copy.tripIdeaSearchHotels"), buildGoogleHotelsUrl(idea.destination))}
            </div>
            </section>
            <section className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                {t("copy.tripIdeaTabDaily")}
              </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <DetailStat
                accent="amber"
                label={t("copy.tripIdeaFoodPerDay")}
                value={money(foodPerDay)}
                hint={t("copy.tripIdeaDurationDays", { days })}
              />
              <DetailStat
                accent="emerald"
                label={t("copy.tripIdeaActivitiesPerDay")}
                value={money(activitiesPerDay)}
                hint={t("copy.tripIdeaDurationDays", { days })}
              />
            </div>
            <DetailStat
              accent="blue"
              label={t("copy.tripIdeaDailyTotal")}
              value={money(dailyPerPerson)}
              hint={t("copy.tripIdeaPerPerson", { amount: money(dailyPerPerson) })}
            />
            </section>
          </TabsContent>

          {!converted && (
            <TabsContent value="savings" className={TAB_PANEL}>
              <SavingsPlanner
                key={`${idea.id}-${idea.startDate}-${idea.targetTripCostMinor ?? "unset"}-${plan?.version ?? 0}`}
                idea={idea}
                plan={plan}
                onSave={onSaveSavings}
                bare
              />
            </TabsContent>
          )}

          {!converted && SHOW_PRICE_TAB && (
            <TabsContent value="prices" className={TAB_PANEL}>
              <p className="text-sm text-muted-foreground">
                {t("copy.tripIdeaPriceDisclosure")}
              </p>
              <form
                onSubmit={(event) => void savePrice(event)}
                className="grid gap-3 rounded-xl border border-border/60 bg-muted/20 p-4 sm:grid-cols-2"
              >
                <div className="space-y-1.5">
                  <Label htmlFor={`price-category-${idea.id}`}>
                    {t("copy.tripIdeaPriceCategory")}
                  </Label>
                  <select
                    id={`price-category-${idea.id}`}
                    value={priceCategory}
                    onChange={(event) =>
                      setPriceCategory(event.target.value as SpendingCategory)
                    }
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
                        {money(check.amountMinor)} · {check.source} ·{" "}
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
            </TabsContent>
          )}
        </Tabs>
      </div>

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
