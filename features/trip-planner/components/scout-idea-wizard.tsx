"use client";

import Image from "next/image";
import {
  ArrowLeft,
  ArrowRight,
  BedDouble,
  Building2,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  Compass,
  Heart,
  LoaderCircle,
  LocateFixed,
  PiggyBank,
  Plane,
  Plus,
  Sparkles,
  Trees,
  TrendingDown,
  User,
  UsersRound,
  Waves,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { reverseGeocodeDestination, type PlaceDetails } from "@/app/actions/places";
import { generateScoutTripIdeas } from "@/app/actions/scout-trip-ideas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  decimalFromMinorUnits,
  formatMinorUnits,
  getCurrencyExponent,
  parseMinorUnits,
} from "@/features/domain/money";
import {
  tripIdeaRepository,
  tripSavingsPlanRepository,
} from "@/features/trip-planner/data/dexie-trip-planner-repository";
import { scoutBudgetPresets } from "@/features/trip-planner/domain/scout-budget-presets";
import {
  buildScoutIdeaPlan,
  type ScoutIdeaPlan,
} from "@/features/trip-planner/domain/scout-idea-plan";
import { routeSignature } from "@/features/trip-planner/domain/scout-flight-route";
import {
  mapScoutIdeaToTripIdea,
  type ScoutIdeaPlace,
} from "@/features/trip-planner/domain/scout-trip-idea-mapping";
import {
  getScoutWizardSteps,
  type ScoutWizardStepId,
} from "@/features/trip-planner/domain/scout-wizard-steps";
import {
  SCOUT_INITIAL_IDEA_COUNT,
  SCOUT_MORE_IDEA_COUNT,
  type ScoutTripIdeaSuggestion,
  type ScoutTripIdeasInput,
} from "@/features/trip-planner/domain/scout-trip-ideas-schema";
import {
  buildGoogleFlightsUrl,
  buildGoogleHotelsUrl,
} from "@/features/trip-planner/domain/google-travel-links";
import { buildAirbnbSearchUrl } from "@/features/trip-planner/domain/stay-links";
import { DestinationField } from "@/features/trips/components/destination-field";
import { ScoutCrewContactsDialog } from "@/features/trip-planner/components/scout-crew-contacts-dialog";
import {
  FlightRouteLegs,
  FlightRouteSummary,
} from "@/features/trip-planner/components/scout-flight-route-view";
import { ScoutWhereStep } from "@/features/trip-planner/components/scout-where-step";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { localizeUserError } from "@/lib/i18n/localize-error";
import type { TranslationKey } from "@/lib/i18n/translations";
import { cn } from "@/lib/utils";

const VIBE_CHIPS: Array<{
  value: string;
  key: TranslationKey;
  Icon: LucideIcon;
  reactionKey: TranslationKey;
}> = [
  {
    value: "Slow mornings by the water",
    key: "copy.scoutWizardVibeBeach",
    Icon: Waves,
    reactionKey: "copy.scoutWizardVibeBeachReaction",
  },
  {
    value: "Vibrant streets, culture & good food",
    key: "copy.scoutWizardVibeCity",
    Icon: Building2,
    reactionKey: "copy.scoutWizardVibeCityReaction",
  },
  {
    value: "Fresh mountain air & quiet trails",
    key: "copy.scoutWizardVibeNature",
    Icon: Trees,
    reactionKey: "copy.scoutWizardVibeNatureReaction",
  },
];

const CREW_CHOICES: Array<{
  size: number;
  key: TranslationKey;
  subtitleKey: TranslationKey;
  Icon: LucideIcon;
  reactionKey: TranslationKey;
}> = [
  {
    size: 1,
    key: "copy.scoutWizardCrewSolo",
    subtitleKey: "copy.scoutWizardCrewSoloSubtitle",
    Icon: User,
    reactionKey: "copy.scoutWizardCrewSoloReaction",
  },
  {
    size: 2,
    key: "copy.scoutWizardCrewPartner",
    subtitleKey: "copy.scoutWizardCrewPartnerSubtitle",
    Icon: Heart,
    reactionKey: "copy.scoutWizardCrewDuoReaction",
  },
  {
    size: 3,
    key: "copy.scoutWizardCrewFriends",
    subtitleKey: "copy.scoutWizardCrewFriendsSubtitle",
    Icon: UsersRound,
    reactionKey: "copy.scoutWizardCrewGroupReaction",
  },
];

const TIMING_CHOICES: Array<{
  value: ScoutTripIdeasInput["timing"];
  key: TranslationKey;
  subtitleKey?: TranslationKey;
  Icon: LucideIcon;
  reactionKey: TranslationKey;
}> = [
  {
    value: "dates",
    key: "copy.scoutWizardTimingDates",
    Icon: CalendarRange,
    reactionKey: "copy.scoutWizardTimingDatesReaction",
  },
  {
    value: "asap",
    key: "copy.scoutWizardTimingAsap",
    subtitleKey: "copy.scoutWizardTimingAsapSubtitle",
    Icon: PiggyBank,
    reactionKey: "copy.scoutWizardTimingAsapReaction",
  },
  {
    value: "month",
    key: "copy.scoutWizardTimingMonth",
    Icon: CalendarDays,
    reactionKey: "copy.scoutWizardTimingMonthReaction",
  },
  {
    value: "cheapest",
    key: "copy.scoutWizardTimingCheapest",
    Icon: TrendingDown,
    reactionKey: "copy.scoutWizardTimingCheapestReaction",
  },
];

const LENGTH_CHOICES: Array<{ value: ScoutTripIdeasInput["tripLength"]; key: TranslationKey }> = [
  { value: "any", key: "copy.scoutWizardLengthAny" },
  { value: "weekend", key: "copy.scoutWizardLengthWeekend" },
  { value: "week", key: "copy.scoutWizardLengthWeek" },
  { value: "two-weeks", key: "copy.scoutWizardLengthTwoWeeks" },
];

const STEP_LABELS: Record<ScoutWizardStepId, TranslationKey> = {
  where: "copy.scoutWizardStepWhere",
  vibe: "copy.scoutWizardStepVibe",
  crew: "copy.scoutWizardStepCrew",
  budget: "copy.scoutWizardStepBudget",
  takeoff: "copy.scoutWizardStepDeparture",
  timing: "copy.scoutWizardStepTiming",
};

const STEP_QUESTIONS: Record<ScoutWizardStepId, TranslationKey> = {
  where: "copy.scoutWizardWhereQuestion",
  vibe: "copy.scoutWizardVibeQuestion",
  crew: "copy.scoutWizardCrewQuestion",
  budget: "copy.scoutWizardBudgetQuestion",
  takeoff: "copy.scoutWizardOriginQuestion",
  timing: "copy.scoutWizardTimingQuestion",
};

const STEP_HELP: Record<ScoutWizardStepId, TranslationKey> = {
  where: "copy.scoutWizardWhereHelp",
  vibe: "copy.scoutWizardVibeHelp",
  crew: "copy.scoutWizardCrewHelp",
  budget: "copy.scoutWizardBudgetHelp",
  takeoff: "copy.scoutWizardOriginHelp",
  timing: "copy.scoutWizardTimingHelp",
};

const CONTINENT_KEYS: Record<Suggestion["continent"], TranslationKey> = {
  Africa: "copy.scoutContinentAfrica",
  Asia: "copy.scoutContinentAsia",
  Europe: "copy.scoutContinentEurope",
  "North America": "copy.scoutContinentNorthAmerica",
  "South America": "copy.scoutContinentSouthAmerica",
  Oceania: "copy.scoutContinentOceania",
};

const EASE: [number, number, number, number] = [0.23, 1, 0.32, 1];
const CARD_ENTER_MS = 0.24;
const SCOUT_FIRST_WAVE_COUNT = 2;
const SCOUT_STAGE_KEYS = [
  "copy.scoutWizardStage1",
  "copy.scoutWizardStage2",
  "copy.scoutWizardStage3",
  "copy.scoutWizardStage4",
  "copy.scoutWizardStage5",
] as const;
const CARD_STAGGER_MS = 0.04;
const CARD_STAGGER_CAP = 4;
const TYPEWRITER_MS = 10;
const TYPEWRITER_MAX_MS = 700;
const MAX_DURATION_DAYS = 60;

type Suggestion = ScoutTripIdeaSuggestion;
type WizardField =
  | "where"
  | "vibe"
  | "crew"
  | "savings"
  | "month"
  | "duration"
  | "startDate"
  | "endDate"
  | "consent";

function toMinorUnits(wholeCurrencyUnits: number, currency: string): bigint {
  return BigInt(wholeCurrencyUnits) * 10n ** BigInt(getCurrencyExponent(currency));
}

function formatDay(isoDate: string, locale: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, day))
  );
}

/** Quick-pill label: whole currency units, no cents ("$100", "15.000 ¥"). */
function formatWholeAmount(amountMinor: bigint, currency: string, locale: string): string {
  const whole = amountMinor / 10n ** BigInt(getCurrencyExponent(currency));
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(Number(whole));
}

/**
 * Scout's spoken line. The full sentence is exposed to assistive tech while the
 * visible text types itself out; reduced-motion users see the whole line at
 * once, and tapping the bubble completes it immediately.
 */
function ScoutSpeech({
  text,
  reducedMotion,
  animate,
  className,
}: {
  text: string;
  reducedMotion: boolean;
  animate: boolean;
  className?: string;
}) {
  const [visible, setVisible] = useState(() => (animate && !reducedMotion ? "" : text));

  useEffect(() => {
    if (!animate || reducedMotion) return;
    const interval = Math.min(TYPEWRITER_MS, TYPEWRITER_MAX_MS / Math.max(1, text.length));
    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      setVisible(text.slice(0, index));
      if (index >= text.length) window.clearInterval(timer);
    }, interval);
    return () => window.clearInterval(timer);
  }, [text, reducedMotion, animate]);

  const complete = () => setVisible(text);

  return (
    <p className={className} onClick={complete}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {visible}
        {visible.length < text.length && (
          <span className="ml-0.5 inline-block w-0.5 animate-pulse bg-current align-middle">
            &nbsp;
          </span>
        )}
      </span>
    </p>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/40 py-2 last:border-b-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium tabular-nums">{value}</dd>
    </div>
  );
}

/** Says out loud whether a step or field blocks the flow. */
function RequirementHint({ kind }: { kind: "required" | "optional" }) {
  const { t } = useI18n();
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        kind === "required"
          ? "bg-destructive/10 text-destructive"
          : "bg-muted text-muted-foreground"
      )}
    >
      {t(kind === "required" ? "copy.scoutWizardRequired" : "copy.scoutWizardOptional")}
    </span>
  );
}

/**
 * The expanded idea surface: one compact panel pairing the budget breakdown
 * (total, proportion bar, per-leg amounts) with the savings timeline, so every
 * number appears exactly once.
 */
function IdeaDetails({
  suggestion,
  plan,
  crewSize,
  currency,
  locale,
  summary,
  nonstopOnly,
}: {
  suggestion: Suggestion;
  plan: ScoutIdeaPlan;
  crewSize: number;
  currency: string;
  locale: string;
  summary: string;
  nonstopOnly: boolean;
}) {
  const { t } = useI18n();
  const readyLabel = !plan.savings.hasPace
    ? t("copy.scoutIdeaSearchNotSet")
    : plan.savings.withinReach
      ? formatDay(plan.savings.readyOn, locale)
      : t("copy.scoutIdeaTimelineUnknown");
  const bookByLabel = plan.savings.hasPace
    ? formatDay(plan.flights.bookBy, locale)
    : t("copy.scoutIdeaSearchNotSet");
  const budgetTotal = plan.grandTotalMinor;
  const share = (part: bigint) =>
    budgetTotal > 0n ? Number((part * 1000n) / budgetTotal) / 10 : 0;
  const budgetRows = [
    {
      label: t("copy.scoutIdeaBudgetFlights"),
      amount: plan.flightTotalMinor,
      detail: t("copy.scoutIdeaBudgetFlightsDetail", {
        amount: formatMinorUnits(plan.flightTotalMinor / BigInt(crewSize), currency),
        travelers: crewSize,
      }),
      dot: "bg-viatik-blue",
    },
    {
      label: t("copy.scoutIdeaBudgetStay"),
      amount: plan.stay.hotelTotalMinor,
      detail: t("copy.scoutIdeaBudgetStayDetail", {
        amount: formatMinorUnits(plan.stay.nightlyHotelMinor, currency),
        nights: plan.nights,
      }),
      dot: "bg-viatik-magenta",
    },
    {
      label: t("copy.scoutIdeaBudgetDaily"),
      amount: plan.dailyTotalMinor,
      detail: t("copy.scoutIdeaBudgetDailyDetail", {
        amount: formatMinorUnits(
          plan.dailyTotalMinor / BigInt(crewSize * suggestion.ideal_duration_days),
          currency
        ),
        days: suggestion.ideal_duration_days,
        travelers: crewSize,
      }),
      dot: "bg-muted-foreground/40",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1">
        <Badge variant="muted" className="gap-1.5 normal-case tracking-normal">
          <CalendarClock aria-hidden className="size-3.5" />
          {suggestion.best_season}
        </Badge>
        <Badge variant="outline" className="normal-case tracking-normal">
          {t("copy.scoutIdeaSearchCabinEconomy")}
        </Badge>
        <Badge variant="outline" className="normal-case tracking-normal">
          {nonstopOnly
            ? t("copy.scoutIdeaSearchStopsNonstop")
            : t("copy.scoutIdeaSearchStopsAny")}
        </Badge>
      </div>

      <section className="grid gap-3 rounded-2xl border bg-muted/30 p-3 lg:grid-cols-2">
        <div className="min-w-0">
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0">
              <h4 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {t("copy.scoutIdeaBudgetTotal")}
              </h4>
              <p className="truncate text-xl font-semibold tabular-nums">
                {formatMinorUnits(budgetTotal, currency)}
              </p>
            </div>
            <p className="shrink-0 text-xs text-muted-foreground">
              {t("copy.scoutIdeaSearchTravelers")}: {crewSize}
            </p>
          </div>
          <div aria-hidden className="mt-2 flex h-2 overflow-hidden rounded-full">
            {budgetRows.map((row) => (
              <div
                key={row.label}
                className={row.dot}
                style={{ width: `${share(row.amount)}%` }}
              />
            ))}
          </div>
          <dl className="mt-2 grid grid-cols-3 gap-2">
            {budgetRows.map((row) => (
              <div key={row.label} className="min-w-0">
                <dt className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                  <span
                    aria-hidden
                    className={cn("size-2 shrink-0 rounded-full", row.dot)}
                  />
                  <span className="truncate">{row.label}</span>
                </dt>
                <dd className="mt-0.5 truncate text-sm font-semibold tabular-nums">
                  {formatMinorUnits(row.amount, currency)}
                </dd>
                <dd className="truncate text-[11px] text-muted-foreground">{row.detail}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="min-w-0">
          <h4 className="sr-only">{t("copy.scoutIdeaSavingsHeading")}</h4>
          {!plan.savings.hasPace ? (
            <p className="text-xs text-muted-foreground">{summary}</p>
          ) : (
            <>
              <ol className="grid grid-cols-3 gap-2">
                {[
                  {
                    label: t("copy.scoutIdeaTimelineToday"),
                    value: t("copy.scoutIdeaTimelineNow"),
                  },
                  { label: t("copy.scoutIdeaTimelineBookBy"), value: bookByLabel },
                  { label: t("copy.scoutIdeaTimelineReady"), value: readyLabel },
                ].map((node, index) => (
                  <li key={node.label} className="min-w-0">
                    <div
                      aria-hidden
                      className={cn(
                        "h-1 rounded-full",
                        index === 0 ? "bg-viatik-gradient" : "bg-border"
                      )}
                    />
                    <p className="mt-1.5 truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {node.label}
                    </p>
                    <p className="mt-0.5 truncate text-xs font-semibold tabular-nums">
                      {node.value}
                    </p>
                  </li>
                ))}
              </ol>
              {plan.dates.pinned && (
                <p className="mt-2 text-xs font-medium">
                  {t("copy.scoutIdeaPinnedDates", {
                    start: formatDay(plan.stay.checkIn, locale),
                    end: formatDay(plan.stay.checkOut, locale),
                  })}
                </p>
              )}
              {plan.dates.shortfallMinor !== null && (
                <p
                  className={cn(
                    "mt-1 text-xs",
                    plan.dates.shortfallMinor > 0n
                      ? "font-medium text-viatik-magenta"
                      : "text-success"
                  )}
                >
                  {plan.dates.shortfallMinor > 0n
                    ? t("copy.scoutIdeaShortfall", {
                        amount: formatMinorUnits(plan.dates.shortfallMinor, currency),
                      })
                    : t("copy.scoutIdeaCovered")}
                </p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">{summary}</p>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function ScoutInfoDialog({
  kind,
  suggestion,
  plan,
  crewSize,
  currency,
  locale,
  origin,
  nonstopOnly,
  why,
  onClose,
}: {
  kind: "flights" | "stay";
  suggestion: Suggestion;
  plan: ScoutIdeaPlan;
  crewSize: number;
  currency: string;
  locale: string;
  origin: string;
  nonstopOnly: boolean;
  why: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const isFlights = kind === "flights";

  const flightsUrl = buildGoogleFlightsUrl({
    origin,
    destination: suggestion.destination,
    startDate: plan.flights.earliestDeparture,
    returnDate: plan.flights.returnDate,
    passengers: crewSize,
    nonstopOnly,
    currency,
    locale,
  });
  const airbnbUrl = buildAirbnbSearchUrl({
    destination: suggestion.destination,
    checkIn: plan.stay.checkIn,
    checkOut: plan.stay.checkOut,
    adults: crewSize,
  });
  const hotelsUrl = buildGoogleHotelsUrl(suggestion.destination);

  return (
    <Dialog open onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent
        className="max-h-[88dvh] overflow-y-auto pt-8 sm:top-[calc(50%-8px)] sm:max-w-lg"
        overlayClassName="bg-black/20"
        nested
      >
        <div
          aria-hidden
          className={cn(
            "absolute inset-x-0 top-0 h-0.5",
            isFlights ? "bg-viatik-blue" : "bg-viatik-magenta"
          )}
        />
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "grid size-10 shrink-0 place-items-center rounded-xl text-white",
                isFlights ? "bg-viatik-blue" : "bg-viatik-magenta"
              )}
            >
              {isFlights ? <Plane aria-hidden /> : <BedDouble aria-hidden />}
            </div>
            <DialogTitle>
              {isFlights
                ? t("copy.scoutIdeaFlightsDialogTitle", { destination: suggestion.destination })
                : t("copy.scoutIdeaStayDialogTitle", { destination: suggestion.destination })}
            </DialogTitle>
          </div>
        </DialogHeader>

        <section className="space-y-2" aria-labelledby={`search-${kind}`}>
          <h4 id={`search-${kind}`} className="text-sm font-semibold">
            {t("copy.scoutIdeaSearchHeading")}
          </h4>
          <dl className="rounded-xl border border-border/60 bg-muted/30 px-4 py-2">
            {isFlights ? (
              <>
                <InfoRow
                  label={t("copy.scoutIdeaSearchFrom")}
                  value={origin || t("copy.scoutIdeaSearchNotSet")}
                />
                <InfoRow
                  label={t("copy.scoutIdeaSearchTo")}
                  value={suggestion.destination}
                />
                <InfoRow
                  label={t("copy.scoutIdeaSearchDepart")}
                  value={formatDay(plan.flights.earliestDeparture, locale)}
                />
                <InfoRow
                  label={t("copy.scoutIdeaSearchReturn")}
                  value={formatDay(plan.flights.returnDate, locale)}
                />
                <InfoRow
                  label={t("copy.scoutIdeaSearchTravelers")}
                  value={String(crewSize)}
                />
                <InfoRow
                  label={t("copy.scoutIdeaSearchCabin")}
                  value={t("copy.scoutIdeaSearchCabinEconomy")}
                />
                <InfoRow
                  label={t("copy.scoutIdeaSearchStops")}
                  value={
                    nonstopOnly
                      ? t("copy.scoutIdeaSearchStopsNonstop")
                      : t("copy.scoutIdeaSearchStopsAny")
                  }
                />
              </>
            ) : (
              <>
                <InfoRow
                  label={t("copy.scoutIdeaDialogCheckIn")}
                  value={formatDay(plan.stay.checkIn, locale)}
                />
                <InfoRow
                  label={t("copy.scoutIdeaDialogCheckOut")}
                  value={formatDay(plan.stay.checkOut, locale)}
                />
                <InfoRow
                  label={t("copy.scoutIdeaSearchGuests")}
                  value={String(crewSize)}
                />
                <InfoRow label={t("copy.scoutIdeaDialogNights")} value={String(plan.nights)} />
                <InfoRow
                  label={t("copy.scoutIdeaDialogHotel")}
                  value={t("copy.scoutIdeaStayPerNight", {
                    amount: formatMinorUnits(plan.stay.nightlyHotelMinor, currency),
                    total: formatMinorUnits(plan.stay.hotelTotalMinor, currency),
                    nights: plan.nights,
                  })}
                />
                <InfoRow
                  label={t("copy.scoutIdeaDialogAltStay")}
                  value={t("copy.scoutIdeaStayPerNight", {
                    amount: formatMinorUnits(plan.stay.nightlyAltMinor, currency),
                    total: formatMinorUnits(plan.stay.altTotalMinor, currency),
                    nights: plan.nights,
                  })}
                />
              </>
            )}
          </dl>
          {isFlights && !origin && (
            <p className="text-xs text-muted-foreground">
              {t("copy.scoutIdeaSearchFromAutoNote")}
            </p>
          )}
        </section>

        {isFlights && (
          <section className="space-y-2" aria-labelledby={`route-${kind}`}>
            <h4 id={`route-${kind}`} className="text-sm font-semibold">
              {t("copy.scoutRouteLegsHeading")}
            </h4>
            <FlightRouteLegs route={suggestion.flight_route} />
            <p className="text-xs text-muted-foreground">{t("copy.scoutRouteGoogleMayDiffer")}</p>
          </section>
        )}

        <section className="space-y-1.5" aria-labelledby={`why-${kind}`}>
          <h4 id={`why-${kind}`} className="text-sm font-semibold">
            {t("copy.scoutIdeaWhyHeading")}
          </h4>
          <p className="rounded-xl border-l-2 border-viatik-magenta bg-muted/40 p-3 text-sm">
            {why}
          </p>
        </section>

        {isFlights && (
          <section className="space-y-2" aria-labelledby={`estimate-${kind}`}>
            <h4 id={`estimate-${kind}`} className="text-sm font-semibold">
              {t("copy.scoutIdeaBudgetFlights")}
            </h4>
            <dl className="rounded-xl border border-border/60 bg-muted/30 px-4 py-2">
              <InfoRow
                label={t("copy.scoutIdeaDialogFarePerTraveler")}
                value={formatMinorUnits(
                  toMinorUnits(suggestion.estimated_flight_cost_per_person, currency),
                  currency
                )}
              />
              <InfoRow
                label={t("copy.scoutIdeaDialogTotal")}
                value={formatMinorUnits(plan.flightTotalMinor, currency)}
              />
              <InfoRow
                label={t("copy.scoutIdeaDialogWindow")}
                value={t("copy.scoutIdeaDialogWindowValue", {
                  weeks: Math.round(plan.flights.bookingWindowDays / 7),
                })}
              />
              <InfoRow
                label={t("copy.scoutIdeaDialogBookBy")}
                value={formatDay(plan.flights.bookBy, locale)}
              />
            </dl>
          </section>
        )}

        {!isFlights && plan.stay.altSavingsMinor > 0n && (
          <p className="text-sm font-medium text-success">
            {t("copy.scoutIdeaStaySaving", {
              amount: formatMinorUnits(plan.stay.altSavingsMinor, currency),
            })}
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          {isFlights
            ? t("copy.scoutIdeaWhatYouWillSeeFlights")
            : t("copy.scoutIdeaWhatYouWillSeeStay")}
        </p>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" className="min-h-11" onClick={onClose}>
            {t("copy.scoutIdeaDialogClose")}
          </Button>
          {isFlights ? (
            <Button asChild className="min-h-11 bg-viatik-gradient text-white">
              <a href={flightsUrl} target="_blank" rel="noopener noreferrer">
                <Plane aria-hidden />
                {t("copy.scoutIdeaSearchFlightsCta")}
              </a>
            </Button>
          ) : (
            <>
              <Button asChild variant="outline" className="min-h-11">
                <a href={hotelsUrl} target="_blank" rel="noopener noreferrer">
                  {t("copy.scoutIdeaDialogOpenProvider", { provider: "Google Hotels" })}
                </a>
              </Button>
              <Button asChild className="min-h-11 bg-viatik-gradient text-white">
                <a href={airbnbUrl} target="_blank" rel="noopener noreferrer">
                  <BedDouble aria-hidden />
                  {t("copy.scoutIdeaSearchStayCta")}
                </a>
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChoiceChips<T extends string>({
  label,
  hint,
  options,
  value,
  onChange,
}: {
  label: string;
  hint?: ReactNode;
  options: Array<{ value: T; key: TranslationKey }>;
  value: T;
  onChange: (value: T) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{label}</p>
        {hint}
      </div>
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(9rem, 1fr))" }}
        role="group"
        aria-label={label}
      >
        {options.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant={value === option.value ? "default" : "outline"}
            aria-pressed={value === option.value}
            className="min-h-11 whitespace-normal text-center text-sm"
            onClick={() => onChange(option.value)}
          >
            {t(option.key)}
          </Button>
        ))}
      </div>
    </div>
  );
}

/**
 * A tactile answer card: an icon anchor, a title, and an optional one-line
 * explainer. Selection is conveyed by both `aria-pressed` and the ring/fill
 * treatment, so it never depends on color alone.
 */
function SelectableCard({
  selected,
  title,
  subtitle,
  icon,
  onSelect,
  groupAnchor = false,
  compact = false,
}: {
  selected: boolean;
  title: string;
  subtitle?: string;
  icon: ReactNode;
  onSelect: () => void;
  groupAnchor?: boolean;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      data-scout-crew={groupAnchor ? "" : undefined}
      onClick={onSelect}
      className={cn(
        "flex min-h-11 w-full cursor-pointer rounded-xl border border-border/80 bg-card/60 text-left transition-all duration-200 ease-out hover:border-primary/50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        compact ? "h-full items-center gap-2.5 p-3" : "items-start gap-3 p-4",
        selected && "border-primary bg-primary/5 shadow-sm ring-2 ring-primary"
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid shrink-0 place-items-center rounded-lg",
          compact ? "size-8" : "size-9",
          selected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
        )}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span
          className={cn(
            "block text-sm font-semibold",
            compact ? "leading-tight" : "leading-snug"
          )}
        >
          {title}
        </span>
        {subtitle && (
          <span
            className={cn(
              "mt-0.5 block leading-snug text-muted-foreground",
              compact ? "text-[11px] line-clamp-2" : "text-xs"
            )}
          >
            {subtitle}
          </span>
        )}
      </span>
    </button>
  );
}

/** Shimmer placeholder shaped like a result card; shared by the loading view
 *  and the wave-2 "more coming" placeholders. */
function ScoutSkeletonCard({ index, reducedMotion }: { index: number; reducedMotion: boolean }) {
  return (
    <motion.div
      aria-hidden
      initial={reducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: reducedMotion ? 0 : index * 0.08 }}
      className="relative w-[86vw] shrink-0 snap-center overflow-hidden rounded-2xl border border-border/60 bg-card p-4 sm:w-auto"
    >
      <div className="flex items-center gap-3">
        <div className="size-9 shrink-0 rounded-xl bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-1/2 rounded bg-muted" />
          <div className="h-2.5 w-1/3 rounded bg-muted" />
        </div>
      </div>
      <div className="mt-3 space-y-2">
        <div className="h-2.5 w-full rounded bg-muted" />
        <div className="h-2.5 w-3/4 rounded bg-muted" />
      </div>
      <div className="mt-3 h-5 w-20 rounded-full bg-muted" />
      {!reducedMotion && (
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-foreground/10 to-transparent"
          animate={{ x: ["-100%", "100%"] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "linear", delay: index * 0.15 }}
        />
      )}
    </motion.div>
  );
}

/** Scout's one-line reaction to the answer just picked. */
function ScoutReaction({ text }: { text: string | null }) {
  return (
    <div aria-live="polite" className="mt-2 min-h-5">
      {text && (
        <p className="flex items-start gap-1.5 text-sm font-medium text-viatik-magenta">
          <Sparkles aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {text}
        </p>
      )}
    </div>
  );
}

/**
 * Names every screen the wizard actually shows. The previous single bar capped
 * at the fifth question, so the optional fine-tune screen looked like an
 * unlisted extra step.
 */
function WizardProgress({ steps, step }: { steps: ScoutWizardStepId[]; step: number }) {
  const { t } = useI18n();

  return (
    <ol
      className="mx-6 mt-4 grid shrink-0 gap-1"
      style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      aria-label={t("copy.scoutWizardProgressLabel")}
    >
      {steps.map((id, index) => (
        <li key={id} aria-current={index === step ? "step" : undefined} className="min-w-0">
          <div
            aria-hidden
            className={cn(
              "h-1.5 rounded-full transition-colors duration-300",
              index > step
                ? "bg-muted"
                : index === step
                  ? "bg-viatik-gradient"
                  : "bg-viatik-blue/40"
            )}
          />
          <span className="sr-only">{t(STEP_LABELS[id])}</span>
        </li>
      ))}
    </ol>
  );
}

export function ScoutIdeaWizard({
  open,
  onOpenChange,
  onManualAdd,
  currency,
  isOnline,
  defaultOrigin = "",
  userId = "",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onManualAdd: () => void;
  currency: string;
  isOnline: boolean | null;
  defaultOrigin?: string;
  /** Dexie contacts owner; the contacts crew picker stays local-only. */
  userId?: string;
}) {
  const { t, locale } = useI18n();
  const reducedMotion = useReducedMotion() ?? false;
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [vibe, setVibe] = useState("");
  const [destination, setDestination] = useState("");
  const [destinationPlace, setDestinationPlace] = useState<ScoutIdeaPlace | null>(null);
  const [destinationPlaceLabel, setDestinationPlaceLabel] = useState("");
  const [crewMode, setCrewMode] = useState<"count" | "contacts">("count");
  const [travelerContactIds, setTravelerContactIds] = useState<string[]>([]);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [crewSize, setCrewSize] = useState<number | null>(null);
  const [crewSizeDraft, setCrewSizeDraft] = useState("3");
  const [crewGroupPicked, setCrewGroupPicked] = useState(false);
  const [savingsAmount, setSavingsAmount] = useState("");
  const [savingsCadence, setSavingsCadence] = useState<"weekly" | "monthly">("monthly");
  const [originCity, setOriginCity] = useState(defaultOrigin);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locatedCity, setLocatedCity] = useState<string | null>(null);
  const [timing, setTiming] = useState<ScoutTripIdeasInput["timing"]>("asap");
  const [timingTouched, setTimingTouched] = useState(false);
  const [targetMonth, setTargetMonth] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [tripLength, setTripLength] = useState<ScoutTripIdeasInput["tripLength"]>("any");
  const [durationDays, setDurationDays] = useState("");
  const [constraints, setConstraints] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [savingsCapacityMinor, setSavingsCapacityMinor] = useState(0n);
  const [consented, setConsented] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<WizardField, string>>>({});
  const [loading, setLoading] = useState(false);
  const [addingMore, setAddingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [loadingStage, setLoadingStage] = useState(0);
  const runId = useRef(0);
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);
  const [infoDialog, setInfoDialog] = useState<{ kind: "flights" | "stay"; index: number } | null>(
    null
  );

  const routeMode = destination.trim().length > 0;
  const steps = getScoutWizardSteps(routeMode);
  const stepId = steps[Math.min(step, steps.length - 1)] ?? "where";
  /** Contacts crews are you plus the picked people; counts stay manual. */
  const travelers = crewMode === "contacts" ? 1 + travelerContactIds.length : (crewSize ?? 1);
  const crewGroupActive = crewMode === "contacts" || crewGroupPicked;
  /** Inclusive day count for exact dates; null while the pair is incomplete. */
  const exactDatesDays = (() => {
    if (timing !== "dates" || !startDate || !endDate) return null;
    const ms = Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`);
    if (!Number.isFinite(ms) || ms < 0) return null;
    return Math.round(ms / 86_400_000) + 1;
  })();

  function todayIso(): string {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${now.getFullYear()}-${month}-${day}`;
  }

  function reset() {
    setStep(0);
    setDirection(1);
    setVibe("");
    setDestination("");
    setDestinationPlace(null);
    setDestinationPlaceLabel("");
    setCrewMode("count");
    setTravelerContactIds([]);
    setContactsOpen(false);
    setCrewSize(null);
    setCrewSizeDraft("3");
    setCrewGroupPicked(false);
    setSavingsAmount("");
    setSavingsCadence("monthly");
    setOriginCity(defaultOrigin);
    setLocating(false);
    setLocationError(null);
    setLocatedCity(null);
    setTiming("asap");
    setTimingTouched(false);
    setTargetMonth("");
    setStartDate("");
    setEndDate("");
    setTripLength("any");
    setDurationDays("");
    setConstraints("");
    setDetailsOpen(false);
    setSavingsCapacityMinor(0n);
    setConsented(false);
    setSuggestions([]);
    setError(null);
    setFieldErrors({});
    setLoading(false);
    setAddingMore(false);
    setExhausted(false);
    setSavingIndex(null);
    setExpandedIndex(0);
    setInfoDialog(null);
    setPendingCount(0);
    setLoadingStage(0);
    runId.current += 1;
  }

  function close(openNext: boolean) {
    onOpenChange(openNext);
    if (!openNext) reset();
  }

  useEffect(() => {
    if (!loading || reducedMotion) return;
    const interval = window.setInterval(() => {
      setLoadingStage((current) => Math.min(current + 1, SCOUT_STAGE_KEYS.length - 1));
    }, 2800);
    return () => window.clearInterval(interval);
  }, [loading, reducedMotion]);

  function readPosition(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        timeout: 10_000,
        maximumAge: 300_000,
      });
    });
  }

  /**
   * One-tap departure city. The device position is resolved to a city label
   * server-side; only that label survives into the wizard and the Scout prompt.
   */
  async function locateTraveler() {
    setLocationError(null);
    setLocatedCity(null);

    if (isOnline === false) {
      setLocationError(t("copy.scoutWizardLocationOffline"));
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationError(t("copy.scoutWizardLocationUnsupported"));
      return;
    }

    setLocating(true);
    try {
      const position = await readPosition();
      const result = await reverseGeocodeDestination({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        locale: locale === "es" ? "es" : "en",
      });
      if (!result.label) {
        setLocationError(t("copy.scoutWizardLocationNotFound"));
        return;
      }
      setOriginCity(result.label);
      setLocatedCity(result.label);
    } catch (cause) {
      const code = (cause as { code?: number } | null)?.code;
      setLocationError(
        code === 1
          ? t("copy.scoutWizardLocationDenied")
          : t("copy.scoutWizardLocationFailed")
      );
    } finally {
      setLocating(false);
    }
  }

  async function callScout({
    savingsMinor,
    count,
    excludeDestinations,
    excludeRoutes,
  }: {
    savingsMinor: bigint;
    count: number;
    excludeDestinations: string[];
    excludeRoutes: string[];
  }) {
    return generateScoutTripIdeas({
      // Route mode skips the vibe question entirely; only the count travels.
      vibe: routeMode ? "" : vibe,
      crewSize: travelers,
      savingsCapacityMinor: savingsMinor.toString(),
      savingsCadence,
      currency: currency as ScoutTripIdeasInput["currency"],
      consentToAI: true,
      locale: locale === "es" ? "es" : "en",
      count,
      excludeDestinations,
      excludeRoutes,
      destination: destination.trim(),
      originCity: originCity.trim(),
      timing,
      targetMonth: timing === "month" && targetMonth ? targetMonth : null,
      tripLength,
      durationDays: timing === "dates" ? exactDatesDays : parsedDurationDays(),
      startDate: timing === "dates" && startDate ? startDate : null,
      endDate: timing === "dates" && endDate ? endDate : null,
      comfort: "balanced",
      stayStyle: "either",
      nonstopOnly: false,
      constraints: constraints.trim(),
    } satisfies ScoutTripIdeasInput);
  }

  /** Blank means "no preference"; anything else must be 1–60 whole days. */
  function parsedDurationDays(): number | null {
    const raw = durationDays.trim();
    if (!raw) return null;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1 || value > MAX_DURATION_DAYS) return null;
    return value;
  }

  function readSavings(): bigint | null {
    if (!savingsAmount.trim()) return 0n;
    try {
      return parseMinorUnits(savingsAmount, currency);
    } catch {
      return null;
    }
  }

  function clearFieldError(field: WizardField) {
    setFieldErrors((current) => {
      if (!(field in current)) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function focusField(field: WizardField) {
    const target =
      field === "crew"
        ? document.querySelector<HTMLElement>("[data-scout-crew]")
        : document.getElementById(
            field === "vibe"
              ? "scout-vibe"
              : field === "where"
                ? "scout-destination"
                : field === "savings"
                  ? "scout-savings"
                  : field === "month"
                    ? "scout-target-month"
                    : field === "startDate"
                      ? "scout-start-date"
                      : field === "endDate"
                        ? "scout-end-date"
                        : field === "duration"
                          ? "scout-duration-days"
                          : "scout-consent"
          );
    target?.focus();
  }

  /**
   * Validates the step that owns the field so the error appears next to the
   * answer, not in a generic box on the last screen. Focus moves to the first
   * invalid control, which also gives keyboard and screen-reader users the
   * context a disabled button never could.
   */
  function validateStep(current: ScoutWizardStepId): boolean {
    const next: Partial<Record<WizardField, string>> = {};
    if (current === "where" && destination.trim() && !destination.includes(",")) {
      next.where = t("copy.scoutWizardWhereInvalid");
    }
    if (current === "vibe" && vibe.trim().length < 2) {
      next.vibe = t("copy.scoutWizardVibeRequired");
    }
    if (
      current === "crew" &&
      (crewMode === "contacts" ? travelerContactIds.length === 0 : !crewSize)
    ) {
      next.crew = t("copy.scoutWizardChooseCrew");
    }
    if (current === "budget" && readSavings() === null) {
      next.savings = t("copy.scoutWizardSavingsInvalid");
    }
    if (current === "timing") {
      if (timing === "month" && !targetMonth) {
        next.month = t("copy.scoutWizardMonthRequired");
      }
      if (timing === "dates") {
        if (!startDate) {
          next.startDate = t("copy.scoutWizardDateStartRequired");
        } else if (startDate < todayIso()) {
          next.startDate = t("copy.scoutWizardDateStartPast");
        }
        if (!endDate) {
          next.endDate = t("copy.scoutWizardDateEndRequired");
        } else if (startDate && endDate < startDate) {
          next.endDate = t("copy.scoutWizardDateOrderInvalid");
        } else if (exactDatesDays === null || exactDatesDays > MAX_DURATION_DAYS) {
          next.endDate = t("copy.scoutWizardDurationInvalid", {
            min: 1,
            max: MAX_DURATION_DAYS,
          });
        }
      }
      if (timing !== "dates" && durationDays.trim() && parsedDurationDays() === null) {
        next.duration = t("copy.scoutWizardDurationInvalid", {
          min: 1,
          max: MAX_DURATION_DAYS,
        });
      }
      if (!consented) {
        next.consent = t("copy.scoutWizardConsentRequired");
      }
    }

    setFieldErrors(next);
    const firstInvalid = (Object.keys(next) as WizardField[])[0];
    if (firstInvalid) {
      if (firstInvalid === "duration") {
        setDetailsOpen(true);
        window.setTimeout(() => focusField("duration"), 0);
      } else {
        focusField(firstInvalid);
      }
    }
    return !firstInvalid;
  }

  function goNext() {
    setError(null);
    if (!validateStep(stepId)) return;
    setDirection(1);
    setStep((current) => current + 1);
  }

  function goBack() {
    setError(null);
    setDirection(-1);
    setStep((current) => current - 1);
  }

  async function askScout() {
    setError(null);
    if (isOnline !== true) {
      setError(t("copy.scoutWizardNeedsConnection"));
      return;
    }
    if (!validateStep("timing")) return;

    const parsedSavings = readSavings();
    if (parsedSavings === null) {
      setError(t("copy.scoutWizardSavingsInvalid"));
      return;
    }

    const run = ++runId.current;
    setLoading(true);
    setExhausted(false);
    setLoadingStage(0);
    let first: Suggestion[];
    try {
      const result = await callScout({
        savingsMinor: parsedSavings,
        count: SCOUT_FIRST_WAVE_COUNT,
        excludeDestinations: [],
        excludeRoutes: [],
      });
      if (!result.success) {
        setError(localizeUserError(result.error, t, "errors.unexpected"));
        setLoading(false);
        return;
      }
      first = result.suggestions.ideas;
    } catch {
      setError(t("copy.scoutOfflineError"));
      setLoading(false);
      return;
    }

    setSavingsCapacityMinor(parsedSavings);
    setSuggestions(first.slice(0, SCOUT_INITIAL_IDEA_COUNT));
    setExpandedIndex(0);
    const remaining = Math.max(0, SCOUT_INITIAL_IDEA_COUNT - first.length);
    const wantsMore = remaining > 0 && first.length >= SCOUT_FIRST_WAVE_COUNT;
    if (wantsMore) setPendingCount(remaining);
    setLoading(false);
    if (!wantsMore) return;

    try {
      const result = await callScout({
        savingsMinor: parsedSavings,
        count: remaining,
        // Route mode excludes the routings already shown; idea mode excludes places.
        excludeDestinations: routeMode ? [] : first.map((item) => item.destination),
        excludeRoutes: routeMode
          ? first.map((item) => routeSignature(item.flight_route))
          : [],
      });
      if (runId.current !== run) return;
      if (!result.success) {
        setError(localizeUserError(result.error, t, "errors.unexpected"));
        return;
      }
      const fresh = result.suggestions.ideas;
      if (fresh.length < remaining) setExhausted(true);
      setSuggestions((current) => {
        const seenDestinations = new Set(current.map((item) => item.destination));
        const seenRoutes = new Set(
          current.map((item) => routeSignature(item.flight_route))
        );
        const additions = fresh
          .filter((item) =>
            routeMode
              ? !seenRoutes.has(routeSignature(item.flight_route))
              : !seenDestinations.has(item.destination)
          )
          .slice(0, Math.max(0, SCOUT_INITIAL_IDEA_COUNT - current.length));
        return [...current, ...additions];
      });
    } catch {
      if (runId.current === run) setError(t("copy.scoutOfflineError"));
    } finally {
      if (runId.current === run) setPendingCount(0);
    }
  }

  async function addMore() {
    if (pendingCount > 0) return;
    setError(null);
    setAddingMore(true);
    try {
      const result = await callScout({
        savingsMinor: savingsCapacityMinor,
        count: SCOUT_MORE_IDEA_COUNT,
        // Route mode excludes the routings already shown; idea mode excludes places.
        excludeDestinations: routeMode ? [] : suggestions.map((item) => item.destination),
        excludeRoutes: routeMode
          ? suggestions.map((item) => routeSignature(item.flight_route))
          : [],
      });
      if (!result.success) {
        setError(localizeUserError(result.error, t, "errors.unexpected"));
        return;
      }
      const fresh = result.suggestions.ideas;
      if (fresh.length < SCOUT_MORE_IDEA_COUNT) setExhausted(true);
      setSuggestions((current) => [...current, ...fresh]);
    } catch {
      setError(t("copy.scoutOfflineError"));
    } finally {
      setAddingMore(false);
    }
  }

  async function saveSuggestion(suggestion: Suggestion, index: number) {
    setError(null);
    setSavingIndex(index);
    try {
      const mapped = mapScoutIdeaToTripIdea({
        suggestion,
        vibe: routeMode ? "" : vibe,
        crewSize: travelers,
        currency,
        cadence: savingsCadence,
        originCity: originCity.trim(),
        timing,
        startDate: timing === "dates" && startDate ? startDate : null,
        endDate: timing === "dates" && endDate ? endDate : null,
        place: destinationPlace,
        travelerContactIds,
      });
      const saved = await tripIdeaRepository.create(mapped.idea);
      const plan = await tripSavingsPlanRepository.getByIdea(saved.id);
      await tripSavingsPlanRepository.upsert({
        id: plan?.id ?? crypto.randomUUID(),
        tripIdeaId: saved.id,
        currentSavingsMinor: 0n,
        cadence: mapped.cadence,
      });
      close(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Couldn't save this idea. Please try again."
      );
    } finally {
      setSavingIndex(null);
    }
  }

  const completedQuestion = suggestions.length > 0;
  const exactDuration = parsedDurationDays();
  const budgetPresets = scoutBudgetPresets(currency);
  const currentSavings = readSavings();
  const reactionKey =
    stepId === "vibe"
      ? VIBE_CHIPS.find((option) => option.value === vibe)?.reactionKey
      : stepId === "crew"
        ? crewMode === "contacts"
          ? "copy.scoutWizardCrewContactsReaction"
          : CREW_CHOICES.find((option) =>
                option.size === 3 ? (crewSize ?? 0) >= 3 : option.size === crewSize
              )?.reactionKey
        : stepId === "timing" && timingTouched
          ? TIMING_CHOICES.find((option) => option.value === timing)?.reactionKey
          : undefined;
  const reaction = reactionKey ? t(reactionKey) : null;
  const tripDetailsSummary = [
    timing === "dates" && exactDatesDays
      ? t("copy.tripIdeaDurationDays", { days: exactDatesDays })
      : tripLength !== "any"
        ? t(LENGTH_CHOICES.find((option) => option.value === tripLength)!.key)
        : null,
    timing !== "dates" && exactDuration
      ? t("copy.tripIdeaDurationDays", { days: exactDuration })
      : null,
    constraints.trim() ? t("copy.scoutWizardTripDetailsNote") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const plans = suggestions.map((suggestion) =>
    buildScoutIdeaPlan({
      suggestion,
      crewSize: travelers,
      savingsCapacityMinor,
      savingsCadence,
      currency,
      timing,
      targetMonth: timing === "month" && targetMonth ? targetMonth : null,
      startDate: timing === "dates" && startDate ? startDate : null,
      endDate: timing === "dates" && endDate ? endDate : null,
    })
  );
  const lowestCost = plans.length
    ? plans.reduce(
        (min, plan) => (plan.grandTotalMinor < min ? plan.grandTotalMinor : min),
        plans[0]!.grandTotalMinor
      )
    : 0n;
  const lowestFlight = suggestions.length
    ? Math.min(...suggestions.map((item) => item.estimated_flight_cost_per_person))
    : 0;
  const shortestTrip = suggestions.length
    ? Math.min(...suggestions.map((item) => item.ideal_duration_days))
    : 0;

  function secondaryTag(index: number, plan: ScoutIdeaPlan, suggestion: Suggestion) {
    if (index === 0) return null;
    if (plan.grandTotalMinor === lowestCost) return t("copy.scoutIdeaBadgeLowestCost");
    if (suggestion.estimated_flight_cost_per_person === lowestFlight) {
      return t("copy.scoutIdeaBadgeEasiest");
    }
    if (suggestion.ideal_duration_days === shortestTrip) return t("copy.scoutIdeaBadgeShortest");
    return null;
  }

  function whyFor(index: number, plan: ScoutIdeaPlan, suggestion: Suggestion) {
    if (index === 0) return t("copy.scoutIdeaWhyBest");
    if (plan.grandTotalMinor === lowestCost) return t("copy.scoutIdeaWhyCheapest");
    if (suggestion.estimated_flight_cost_per_person === lowestFlight) {
      return t("copy.scoutIdeaWhyEasiest");
    }
    if (suggestion.ideal_duration_days === shortestTrip) return t("copy.scoutIdeaWhyShortest");
    return t("copy.scoutIdeaWhyFits");
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="flex max-h-[92dvh] flex-col overflow-hidden p-0 sm:max-w-2xl">
        <header className="relative shrink-0 border-b border-border/60 bg-card/80 px-6 pb-3 pt-5 backdrop-blur-md">
          <div aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-viatik-gradient" />
          <DialogHeader className="relative mb-0">
            <div className="flex items-center gap-3 pr-10">
              <motion.div
                animate={reducedMotion ? undefined : { y: [0, -3, 0] }}
                transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
                className="relative grid size-12 shrink-0 place-items-center rounded-full bg-muted"
              >
                <span aria-hidden className="glow-magenta absolute inset-0 rounded-full" />
                <Image
                  src="/Scout.png"
                  alt=""
                  width={48}
                  height={48}
                  className="relative size-11 rounded-full object-cover"
                />
              </motion.div>
              <div className="min-w-0">
                <DialogTitle>{t("copy.scoutWizardTitle")}</DialogTitle>
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {completedQuestion
                    ? t("copy.scoutWizardOptionsHeading", { count: suggestions.length })
                    : t("copy.scoutWizardStepProgress", {
                        current: step + 1,
                        total: steps.length,
                        step: t(STEP_LABELS[stepId]),
                      })}
                </p>
              </div>
            </div>
          </DialogHeader>
        </header>

        {!completedQuestion && !loading && isOnline !== false && (
          <WizardProgress steps={steps} step={step} />
        )}

        <div className="flex-1 overflow-y-auto px-6 pb-6 pt-5">
          {isOnline === false ? (
            <div className="space-y-4 rounded-xl border border-border bg-muted/50 p-4">
              <p role="status" className="text-sm">
                {t("copy.scoutWizardOffline")}
              </p>
              <Button
                type="button"
                className="min-h-11"
                onClick={() => {
                  close(false);
                  onManualAdd();
                }}
              >
                {t("copy.scoutWizardManualAdd")}
              </Button>
            </div>
          ) : loading ? (
            <div className="space-y-3" aria-busy="true" aria-live="polite">
              <div className="flex items-center gap-3">
                <motion.span
                  aria-hidden
                  className="grid size-9 shrink-0 place-items-center rounded-xl bg-viatik-gradient text-white"
                  animate={
                    reducedMotion
                      ? undefined
                      : { scale: [1, 1.08, 1], rotate: [0, 8, 0] }
                  }
                  transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Sparkles className="size-4" />
                </motion.span>
                <p className="text-sm font-medium">{t("copy.scoutWizardThinking")}</p>
              </div>
              <div className="min-h-5">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={loadingStage}
                    initial={reducedMotion ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={reducedMotion ? undefined : { opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="text-xs text-muted-foreground"
                  >
                    {t(SCOUT_STAGE_KEYS[loadingStage]!)}
                  </motion.p>
                </AnimatePresence>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-muted">
                <motion.div
                  className="h-full w-1/3 rounded-full bg-viatik-gradient"
                  animate={reducedMotion ? undefined : { x: ["-100%", "250%"] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                />
              </div>
              {Array.from({ length: SCOUT_INITIAL_IDEA_COUNT }).map((_, index) => (
                <ScoutSkeletonCard key={index} index={index} reducedMotion={reducedMotion} />
              ))}
            </div>
          ) : suggestions.length === 0 ? (
            <div className="space-y-5">
              <motion.div
                key={step}
                initial={reducedMotion ? false : { opacity: 0, x: 18 * direction }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.24, ease: EASE }}
                className="space-y-4"
              >
                <div className="relative rounded-2xl border border-border/60 bg-muted/40 p-4">
                  <span
                    aria-hidden
                    className="absolute -top-2 left-5 size-4 rotate-45 border-l border-t border-border/60 bg-muted/40"
                  />
                  <h3 className="text-lg font-semibold" id="scout-where-question">
                    <ScoutSpeech
                      text={t(STEP_QUESTIONS[stepId])}
                      reducedMotion={reducedMotion}
                      animate={step === 0}
                    />
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">{t(STEP_HELP[stepId])}</p>
                  {stepId !== "timing" && (
                    <div className="mt-2">
                      <RequirementHint
                        kind={stepId === "vibe" || stepId === "crew" ? "required" : "optional"}
                      />
                    </div>
                  )}
                  <ScoutReaction text={reaction} />
                </div>

                {stepId === "where" && (
                  <ScoutWhereStep
                    destination={destination}
                    error={fieldErrors.where}
                    onDestinationChange={(next) => {
                      setDestination(next);
                      if (next !== destinationPlaceLabel) {
                        setDestinationPlace(null);
                        setDestinationPlaceLabel("");
                      }
                      setConsented(false);
                      clearFieldError("where");
                    }}
                    onPlaceSelect={(details: PlaceDetails) => {
                      setDestinationPlace({
                        placeId: details.placeId,
                        latitude: details.latitude,
                        longitude: details.longitude,
                        timeZone: details.timeZone ?? "",
                      });
                      setDestinationPlaceLabel(details.label);
                    }}
                    onSurprise={() => {
                      setDestination("");
                      setDestinationPlace(null);
                      setDestinationPlaceLabel("");
                      setConsented(false);
                      clearFieldError("where");
                    }}
                  />
                )}

                {stepId === "vibe" && (
                  <section className="space-y-4" aria-labelledby="scout-vibe-question">
                    <div className="flex flex-wrap gap-2">
                      {VIBE_CHIPS.map((option) => (
                        <Button
                          key={option.value}
                          type="button"
                          variant={vibe === option.value ? "default" : "outline"}
                          aria-pressed={vibe === option.value}
                          className="min-h-11 gap-2 whitespace-normal px-3.5 text-left transition-all duration-200 ease-out active:scale-[0.98]"
                          onClick={() => {
                            setVibe(option.value);
                            setConsented(false);
                            clearFieldError("vibe");
                          }}
                        >
                          <option.Icon aria-hidden className="text-muted-foreground" />
                          {t(option.key)}
                        </Button>
                      ))}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="scout-vibe">{t("copy.scoutWizardVibeCustomLabel")}</Label>
                      <Input
                        id="scout-vibe"
                        value={vibe}
                        maxLength={240}
                        aria-invalid={Boolean(fieldErrors.vibe)}
                        aria-describedby={fieldErrors.vibe ? "scout-vibe-error" : undefined}
                        onChange={(event) => {
                          setVibe(event.target.value);
                          setConsented(false);
                          clearFieldError("vibe");
                        }}
                        placeholder={t("copy.scoutWizardVibePlaceholder")}
                        className={
                          fieldErrors.vibe
                            ? "border-destructive focus-visible:ring-destructive/50"
                            : undefined
                        }
                      />
                      {fieldErrors.vibe && (
                        <p
                          id="scout-vibe-error"
                          role="alert"
                          className="text-xs font-semibold text-destructive"
                        >
                          {fieldErrors.vibe}
                        </p>
                      )}
                    </div>
                  </section>
                )}

                {stepId === "crew" && (
                  <section className="space-y-3">
                    <div
                      className="grid gap-3"
                      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(12rem, 1fr))" }}
                      role="group"
                      aria-label={t("copy.scoutWizardCrewQuestion")}
                      aria-describedby={fieldErrors.crew ? "scout-crew-error" : undefined}
                    >
                      {CREW_CHOICES.map((option, index) => (
                        <SelectableCard
                          key={option.size}
                          groupAnchor={index === 0}
                          selected={
                            option.size === 3
                              ? crewGroupActive
                              : crewMode === "count" && crewSize === option.size
                          }
                          icon={<option.Icon aria-hidden className="size-4" />}
                          title={t(option.key)}
                          subtitle={t(option.subtitleKey)}
                          onSelect={() => {
                            if (option.size === 3) {
                              if (!crewGroupActive) {
                                setCrewMode("count");
                                setTravelerContactIds([]);
                                setCrewSize(3);
                                setCrewSizeDraft("3");
                                setCrewGroupPicked(true);
                              }
                            } else {
                              setCrewMode("count");
                              setTravelerContactIds([]);
                              setCrewSize(option.size);
                              setCrewGroupPicked(false);
                            }
                            setConsented(false);
                            clearFieldError("crew");
                          }}
                        />
                      ))}
                    </div>

                    {crewGroupActive && (
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="scout-crew-size">
                            {t("copy.scoutWizardCrewCountLabel")}
                          </Label>
                          <Input
                            id="scout-crew-size"
                            type="number"
                            inputMode="numeric"
                            min={3}
                            max={20}
                            value={
                              crewMode === "contacts" ? String(travelers) : crewSizeDraft
                            }
                            aria-invalid={Boolean(fieldErrors.crew)}
                            aria-describedby={
                              fieldErrors.crew
                                ? "scout-crew-size-help scout-crew-error"
                                : "scout-crew-size-help"
                            }
                            onChange={(event) => {
                              const draft = event.target.value;
                              setCrewSizeDraft(draft);
                              if (crewMode === "contacts") {
                                setCrewMode("count");
                                setTravelerContactIds([]);
                              }
                              const parsed = Number.parseInt(draft, 10);
                              setCrewSize(
                                Number.isInteger(parsed) && parsed >= 3 && parsed <= 20
                                  ? parsed
                                  : null
                              );
                              setConsented(false);
                              clearFieldError("crew");
                            }}
                          />
                          <p
                            id="scout-crew-size-help"
                            className="text-xs text-muted-foreground"
                          >
                            {t("copy.scoutWizardCrewCountHelp")}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-11"
                          onClick={() => {
                            setCrewMode("contacts");
                            setContactsOpen(true);
                            setConsented(false);
                            clearFieldError("crew");
                          }}
                        >
                          {t("copy.scoutWizardContactsPick")}
                        </Button>
                        {crewMode === "contacts" && (
                          <p aria-live="polite" className="text-sm text-muted-foreground">
                            {t(
                              travelers === 1
                                ? "copy.scoutWizardContactsSummaryOne"
                                : "copy.scoutWizardContactsSummaryMany",
                              { count: travelerContactIds.length, total: travelers }
                            )}
                          </p>
                        )}
                      </div>
                    )}
                    {fieldErrors.crew && (
                      <p
                        id="scout-crew-error"
                        role="alert"
                        className="text-xs font-semibold text-destructive"
                      >
                        {fieldErrors.crew}
                      </p>
                    )}
                  </section>
                )}

                {stepId === "budget" && (
                  <section className="space-y-4" aria-labelledby="scout-wallet-question">
                    <div className="space-y-2">
                      <Label htmlFor="scout-savings">
                        {t("copy.scoutWizardSavingsLabel", { currency })}
                      </Label>
                      {budgetPresets.length > 0 && (
                        <div className="space-y-1.5">
                          <p
                            id="scout-savings-presets"
                            className="text-xs font-medium text-muted-foreground"
                          >
                            {t("copy.scoutWizardBudgetPresets")}
                          </p>
                          <div
                            className="flex flex-wrap gap-2"
                            role="group"
                            aria-labelledby="scout-savings-presets"
                          >
                            {budgetPresets.map((preset) => (
                              <Button
                                key={preset.toString()}
                                type="button"
                                variant={currentSavings === preset ? "default" : "outline"}
                                aria-pressed={currentSavings === preset}
                                className="min-h-11 px-4 tabular-nums"
                                onClick={() => {
                                  setSavingsAmount(decimalFromMinorUnits(preset, currency));
                                  setConsented(false);
                                  clearFieldError("savings");
                                }}
                              >
                                {formatWholeAmount(preset, currency, locale)}
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}
                      <Input
                        id="scout-savings"
                        inputMode="decimal"
                        value={savingsAmount}
                        aria-invalid={Boolean(fieldErrors.savings)}
                        aria-describedby={
                          fieldErrors.savings ? "scout-savings-error" : "scout-savings-help"
                        }
                        onChange={(event) => {
                          setSavingsAmount(event.target.value);
                          setConsented(false);
                          clearFieldError("savings");
                        }}
                        placeholder={currency === "JPY" ? "25000" : "250"}
                        className={
                          fieldErrors.savings
                            ? "border-destructive focus-visible:ring-destructive/50"
                            : undefined
                        }
                      />
                      {fieldErrors.savings && (
                        <p
                          id="scout-savings-error"
                          role="alert"
                          className="text-xs font-semibold text-destructive"
                        >
                          {fieldErrors.savings}
                        </p>
                      )}
                    </div>
                    <div
                      className="flex gap-2"
                      role="group"
                      aria-label={t("copy.scoutWizardCadenceLabel")}
                    >
                      {(["weekly", "monthly"] as const).map((cadence) => (
                        <Button
                          key={cadence}
                          type="button"
                          variant={savingsCadence === cadence ? "default" : "outline"}
                          aria-pressed={savingsCadence === cadence}
                          className="min-h-11"
                          onClick={() => {
                            setSavingsCadence(cadence);
                            setConsented(false);
                          }}
                        >
                          {cadence === "weekly"
                            ? t("copy.scoutWizardWeekly")
                            : t("copy.scoutWizardMonthly")}
                        </Button>
                      ))}
                    </div>
                    <p id="scout-savings-help" className="text-xs text-muted-foreground">
                      {t("copy.scoutWizardSavingsOptional")}
                    </p>
                  </section>
                )}

                {stepId === "takeoff" && (
                  <section className="space-y-3" aria-labelledby="scout-origin-question">
                    <DestinationField
                      id="scout-origin"
                      value={originCity}
                      onChange={(next) => {
                        setOriginCity(next);
                        setLocatedCity(null);
                        setLocationError(null);
                      }}
                      label={t("copy.scoutWizardOriginLabel")}
                      placeholder={t("copy.scoutWizardOriginPlaceholder")}
                      helpText={t("copy.scoutWizardOriginFieldHelp")}
                      autoSearch={locatedCity === null}
                    />
                    <div className="space-y-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11 w-full justify-start gap-2 sm:w-auto"
                        disabled={locating}
                        aria-busy={locating}
                        aria-describedby="scout-location-help"
                        onClick={() => void locateTraveler()}
                      >
                        {locating ? (
                          <LoaderCircle aria-hidden className="animate-spin" />
                        ) : (
                          <LocateFixed aria-hidden />
                        )}
                        {locating
                          ? t("copy.scoutWizardLocating")
                          : t("copy.scoutWizardUseLocation")}
                      </Button>
                      <p id="scout-location-help" className="text-xs text-muted-foreground">
                        {t("copy.scoutWizardLocationHelp")}
                      </p>
                      <div aria-live="polite">
                        {locationError && (
                          <p role="alert" className="text-xs font-semibold text-destructive">
                            {locationError}
                          </p>
                        )}
                        {!locationError && locatedCity && (
                          <p className="text-xs font-medium text-success">
                            {t("copy.scoutWizardLocationFound", { city: locatedCity })}
                          </p>
                        )}
                      </div>
                    </div>
                  </section>
                )}

                {stepId === "timing" && (
                  <section className="space-y-3" aria-labelledby="scout-timing-question">
                    <div className="space-y-2.5">
                      <div
                        className="grid grid-cols-2 items-stretch gap-2"
                        role="group"
                        aria-label={t("copy.scoutWizardTimingQuestion")}
                      >
                        {TIMING_CHOICES.map((option) => (
                          <SelectableCard
                            key={option.value}
                            compact
                            selected={timing === option.value}
                            icon={<option.Icon aria-hidden className="size-4" />}
                            title={t(option.key)}
                            subtitle={option.subtitleKey ? t(option.subtitleKey) : undefined}
                            onSelect={() => {
                              setTiming(option.value);
                              setTimingTouched(true);
                              clearFieldError("month");
                              clearFieldError("startDate");
                              clearFieldError("endDate");
                            }}
                          />
                        ))}
                      </div>
                      {timing === "dates" && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <Label htmlFor="scout-start-date">
                                {t("copy.scoutWizardDateStart")}
                              </Label>
                              <RequirementHint kind="required" />
                            </div>
                            <Input
                              id="scout-start-date"
                              type="date"
                              value={startDate}
                              min={todayIso()}
                              aria-required
                              aria-invalid={Boolean(fieldErrors.startDate)}
                              aria-describedby={
                                fieldErrors.startDate ? "scout-start-date-error" : undefined
                              }
                              onChange={(event) => {
                                setStartDate(event.target.value);
                                setConsented(false);
                                clearFieldError("startDate");
                              }}
                              className={
                                fieldErrors.startDate
                                  ? "h-11 border-destructive focus-visible:ring-destructive/50"
                                  : "h-11"
                              }
                            />
                            {fieldErrors.startDate && (
                              <p
                                id="scout-start-date-error"
                                role="alert"
                                className="text-xs font-semibold text-destructive"
                              >
                                {fieldErrors.startDate}
                              </p>
                            )}
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <Label htmlFor="scout-end-date">{t("copy.scoutWizardDateEnd")}</Label>
                              <RequirementHint kind="required" />
                            </div>
                            <Input
                              id="scout-end-date"
                              type="date"
                              value={endDate}
                              min={startDate || todayIso()}
                              aria-required
                              aria-invalid={Boolean(fieldErrors.endDate)}
                              aria-describedby={
                                fieldErrors.endDate ? "scout-end-date-error" : undefined
                              }
                              onChange={(event) => {
                                setEndDate(event.target.value);
                                setConsented(false);
                                clearFieldError("endDate");
                              }}
                              className={
                                fieldErrors.endDate
                                  ? "h-11 border-destructive focus-visible:ring-destructive/50"
                                  : "h-11"
                              }
                            />
                            {fieldErrors.endDate && (
                              <p
                                id="scout-end-date-error"
                                role="alert"
                                className="text-xs font-semibold text-destructive"
                              >
                                {fieldErrors.endDate}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                      {timing === "month" && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <Label htmlFor="scout-target-month">
                              {t("copy.scoutWizardTimingMonthLabel")}
                            </Label>
                            <RequirementHint kind="required" />
                          </div>
                          <Input
                            id="scout-target-month"
                            type="month"
                            value={targetMonth}
                            aria-required
                            aria-invalid={Boolean(fieldErrors.month)}
                            aria-describedby={fieldErrors.month ? "scout-month-error" : undefined}
                            onChange={(event) => {
                              setTargetMonth(event.target.value);
                              clearFieldError("month");
                            }}
                            className={
                              fieldErrors.month
                                ? "h-11 border-destructive focus-visible:ring-destructive/50"
                                : "h-11"
                            }
                          />
                          {fieldErrors.month && (
                            <p
                              id="scout-month-error"
                              role="alert"
                              className="text-xs font-semibold text-destructive"
                            >
                              {fieldErrors.month}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <Collapsible
                      id="scout-trip-details"
                      title={t("copy.scoutWizardTripDetails")}
                      open={detailsOpen}
                      onOpenChange={setDetailsOpen}
                      badge={
                        tripDetailsSummary ? (
                          <span className="max-w-[15rem] truncate text-[11px] font-medium normal-case tracking-normal text-muted-foreground">
                            {tripDetailsSummary}
                          </span>
                        ) : (
                          <RequirementHint kind="optional" />
                        )
                      }
                    >
                      <div className="space-y-4">
                        {timing !== "dates" && (
                          <>
                            <ChoiceChips
                              label={t("copy.scoutWizardTripLength")}
                              options={LENGTH_CHOICES}
                              value={tripLength}
                              onChange={setTripLength}
                            />
                            <div className="space-y-1.5">
                              <Label htmlFor="scout-duration-days">
                                {t("copy.scoutWizardExactDays")}
                              </Label>
                              <Input
                                id="scout-duration-days"
                                type="number"
                                inputMode="numeric"
                                min={1}
                                max={MAX_DURATION_DAYS}
                                step={1}
                                value={durationDays}
                                aria-invalid={Boolean(fieldErrors.duration)}
                                aria-describedby={
                                  fieldErrors.duration
                                    ? "scout-duration-error"
                                    : "scout-duration-help"
                                }
                                onChange={(event) => {
                                  setDurationDays(event.target.value);
                                  clearFieldError("duration");
                                }}
                                placeholder={t("copy.scoutWizardExactDaysPlaceholder")}
                                className={
                                  fieldErrors.duration
                                    ? "h-11 border-destructive focus-visible:ring-destructive/50"
                                    : "h-11"
                                }
                              />
                              {fieldErrors.duration ? (
                                <p
                                  id="scout-duration-error"
                                  role="alert"
                                  className="text-xs font-semibold text-destructive"
                                >
                                  {fieldErrors.duration}
                                </p>
                              ) : (
                                <p
                                  id="scout-duration-help"
                                  className="text-xs text-muted-foreground"
                                >
                                  {t("copy.scoutWizardExactDaysHelp", { max: MAX_DURATION_DAYS })}
                                </p>
                              )}
                            </div>
                          </>
                        )}

                        <div className="space-y-2">
                          <Label htmlFor="scout-constraints">
                            {t("copy.scoutWizardConstraints")}
                          </Label>
                          <Input
                            id="scout-constraints"
                            value={constraints}
                            maxLength={200}
                            onChange={(event) => setConstraints(event.target.value)}
                            placeholder={t("copy.scoutWizardConstraintsPlaceholder")}
                            className="h-11"
                          />
                        </div>
                      </div>
                    </Collapsible>

                    <div className="space-y-1.5">
                      <label className="flex items-start gap-3 rounded-xl border border-border p-2.5 text-sm">
                        <input
                          id="scout-consent"
                          type="checkbox"
                          checked={consented}
                          aria-required
                          aria-invalid={Boolean(fieldErrors.consent)}
                          aria-describedby={fieldErrors.consent ? "scout-consent-error" : undefined}
                          onChange={(event) => {
                            setConsented(event.target.checked);
                            clearFieldError("consent");
                          }}
                          className="mt-1 size-4 accent-primary"
                        />
                        <span className="flex flex-wrap items-center gap-2">
                          {t("copy.scoutWizardConsent")}
                          <RequirementHint kind="required" />
                        </span>
                      </label>
                      {fieldErrors.consent && (
                        <p
                          id="scout-consent-error"
                          role="alert"
                          className="text-xs font-semibold text-destructive"
                        >
                          {fieldErrors.consent}
                        </p>
                      )}
                    </div>
                  </section>
                )}
              </motion.div>

              {error && (
                <div className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    onClick={() => {
                      close(false);
                      onManualAdd();
                    }}
                  >
                    {t("copy.scoutWizardManualAdd")}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div aria-live="polite" className="sr-only">
                {t("copy.scoutWizardFound", { count: suggestions.length })}
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              {pendingCount > 0 && (
                <p role="status" className="text-sm text-muted-foreground">
                  {t("copy.scoutWizardMoreComing", { count: pendingCount })}
                </p>
              )}
              {suggestions.length < SCOUT_INITIAL_IDEA_COUNT && pendingCount === 0 && (
                <p role="status" className="text-sm text-muted-foreground">
                  {t("copy.scoutWizardFewerResults", {
                    count: suggestions.length,
                    expected: SCOUT_INITIAL_IDEA_COUNT,
                  })}
                </p>
              )}

              <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 sm:flex-col sm:gap-3 sm:overflow-visible">
                {suggestions.map((suggestion, index) => {
                  const plan = plans[index]!;
                  const expanded = expandedIndex === index;
                  const summary = !plan.savings.hasPace
                    ? t("copy.scoutIdeaNoSavingsPace")
                    : plan.savings.withinReach
                      ? t(
                          plan.savings.cadence === "weekly"
                            ? "copy.scoutIdeaSummaryWeekly"
                            : "copy.scoutIdeaSummaryMonthly",
                          {
                            periods: plan.savings.periods,
                            ready: formatDay(plan.savings.readyOn, locale),
                            bookBy: formatDay(plan.flights.bookBy, locale),
                          }
                        )
                      : t("copy.scoutIdeaOutOfReach");
                  const tag = secondaryTag(index, plan, suggestion);

                  return (
                    <motion.article
                      key={`${suggestion.destination}-${index}`}
                      initial={reducedMotion ? false : { opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: CARD_ENTER_MS,
                        delay: reducedMotion
                          ? 0
                          : Math.min(index, CARD_STAGGER_CAP - 1) * CARD_STAGGER_MS,
                        ease: EASE,
                      }}
                      className={cn(
                        "w-[86vw] shrink-0 snap-center overflow-hidden rounded-2xl border bg-card sm:w-auto",
                        index === 0
                          ? "border-primary/40 shadow-md"
                          : "border-border/60 shadow-sm"
                      )}
                    >
                      <div
                        aria-hidden
                        className={cn("w-full bg-viatik-gradient", index === 0 ? "h-1" : "h-0.5")}
                      />
                      <button
                        type="button"
                        aria-expanded={expanded}
                        aria-controls={`scout-idea-${index}`}
                        onClick={() => setExpandedIndex(expanded ? null : index)}
                        className="flex min-h-11 w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div
                          className={cn(
                            "grid size-9 shrink-0 place-items-center rounded-xl",
                            index === 0
                              ? "bg-viatik-gradient text-white"
                              : "bg-viatik-blue/10 text-viatik-blue"
                          )}
                        >
                          <Compass aria-hidden className="size-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate font-semibold">
                              {routeMode
                                ? t("copy.scoutRouteOption", {
                                    option: index + 1,
                                    destination: suggestion.destination,
                                  })
                                : suggestion.destination}
                            </span>
                            {index === 0 && (
                              <span className="inline-flex shrink-0 rounded-full bg-viatik-gradient p-px">
                                <span className="rounded-full bg-card px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-viatik-magenta">
                                  {t("copy.scoutWizardBestMatch")}
                                </span>
                              </span>
                            )}
                            {tag && (
                              <span className="rounded-full bg-viatik-blue/10 px-2 py-0.5 text-[10px] font-medium text-viatik-blue">
                                {tag}
                              </span>
                            )}
                            {!routeMode && (
                              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                {t(CONTINENT_KEYS[suggestion.continent])}
                              </span>
                            )}
                          </div>
                          <p
                            className={cn(
                              "mt-1 text-[13px] leading-relaxed text-foreground/80",
                              !expanded && "line-clamp-2"
                            )}
                          >
                            {suggestion.scout_pitch}
                          </p>
                          <FlightRouteSummary route={suggestion.flight_route} />
                          <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
                            <span className="rounded-full bg-muted px-2 py-0.5 font-semibold text-foreground tabular-nums">
                              {formatMinorUnits(plan.grandTotalMinor, currency)}
                            </span>
                            <span aria-hidden>·</span>
                            <span>
                              {t("copy.tripIdeaDurationDays", {
                                days: suggestion.ideal_duration_days,
                              })}
                            </span>
                          </p>
                        </div>
                        <ChevronDown
                          aria-hidden
                          className={cn(
                            "size-5 shrink-0 text-muted-foreground transition-transform duration-200",
                            expanded && "rotate-180"
                          )}
                        />
                      </button>

                      {expanded && (
                        <motion.div
                          id={`scout-idea-${index}`}
                          initial={reducedMotion ? false : { opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                          className="space-y-3 border-t border-border/40 px-4 pb-4 pt-3"
                        >
                          <IdeaDetails
                            suggestion={suggestion}
                            plan={plan}
                            crewSize={travelers}
                            currency={currency}
                            locale={locale}
                            summary={summary}
                            nonstopOnly={false}
                          />
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <Button
                              type="button"
                              variant="outline"
                              className="min-h-11 sm:flex-1"
                              onClick={() => setInfoDialog({ kind: "flights", index })}
                            >
                              <Plane aria-hidden />
                              {t("copy.scoutIdeaFlightDetails")}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className="min-h-11 sm:flex-1"
                              onClick={() => setInfoDialog({ kind: "stay", index })}
                            >
                              <BedDouble aria-hidden />
                              {t("copy.scoutIdeaStayDetails")}
                            </Button>
                            <Button
                              type="button"
                              className="min-h-11 bg-viatik-gradient text-white transition-all duration-200 ease-out active:scale-[0.98] sm:flex-[1.4]"
                              disabled={savingIndex !== null}
                              onClick={() => void saveSuggestion(suggestion, index)}
                            >
                              {savingIndex === index ? (
                                <LoaderCircle aria-hidden className="animate-spin" />
                              ) : null}
                              {t("copy.scoutWizardSaveIdea")}
                            </Button>
                          </div>
                        </motion.div>
                      )}
                    </motion.article>
                  );
                })}

                {Array.from({ length: pendingCount }).map((_, index) => (
                  <ScoutSkeletonCard
                    key={`pending-${index}`}
                    index={index}
                    reducedMotion={reducedMotion}
                  />
                ))}

                {!exhausted && (
                  <button
                    type="button"
                    disabled={addingMore || pendingCount > 0 || isOnline !== true}
                    onClick={() => void addMore()}
                    className="flex min-h-24 w-[86vw] shrink-0 snap-center flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/70 bg-transparent px-4 py-6 text-sm font-medium text-muted-foreground transition-colors hover:border-viatik-magenta/50 hover:text-foreground disabled:opacity-60 sm:w-auto"
                  >
                    {addingMore ? (
                      <LoaderCircle aria-hidden className="size-5 animate-spin" />
                    ) : (
                      <Plus aria-hidden className="size-5" />
                    )}
                    {addingMore ? t("copy.scoutWizardAddingMore") : t("copy.scoutWizardAddMore")}
                  </button>
                )}
              </div>

              <p className="text-xs text-muted-foreground">{t("copy.scoutWizardDisclaimerFooter")}</p>
              {exhausted && (
                <p className="text-sm text-muted-foreground">{t("copy.scoutWizardNoMore")}</p>
              )}

              <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row">
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11 flex-1"
                  onClick={() => {
                    setSuggestions([]);
                    setExhausted(false);
                    setError(null);
                    setExpandedIndex(0);
                    setPendingCount(0);
                    runId.current += 1;
                    setStep(0);
                  }}
                >
                  <ArrowLeft aria-hidden /> {t("copy.scoutWizardTryAgain")}
                </Button>
              </div>
            </div>
          )}
        </div>

        {!completedQuestion && !loading && isOnline !== false && (
          <footer className="shrink-0 border-t border-border/60 bg-card/95 px-6 py-3 backdrop-blur-md">
            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="ghost"
                className="min-h-11"
                disabled={step === 0 || loading}
                onClick={goBack}
              >
                <ArrowLeft aria-hidden /> {t("copy.scoutWizardBack")}
              </Button>
              {stepId === "timing" ? (
                <Button
                  type="button"
                  className="min-h-11 bg-viatik-gradient text-white transition-all duration-200 ease-out active:scale-[0.98]"
                  disabled={loading || isOnline !== true}
                  onClick={() => void askScout()}
                >
                  <Sparkles aria-hidden />
                  {t("copy.scoutWizardFind")}
                </Button>
              ) : (
                <Button
                  type="button"
                  className="min-h-11 transition-all duration-200 ease-out active:scale-[0.98]"
                  disabled={loading}
                  onClick={goNext}
                >
                  {t("copy.scoutWizardNext")} <ArrowRight aria-hidden />
                </Button>
              )}
            </div>
          </footer>
        )}
      </DialogContent>

      {contactsOpen && (
        <ScoutCrewContactsDialog
          ownerId={userId}
          selectedIds={travelerContactIds}
          onChange={(ids) => {
            setTravelerContactIds(ids);
            setConsented(false);
            clearFieldError("crew");
          }}
          onClose={() => setContactsOpen(false)}
        />
      )}

      {infoDialog && suggestions[infoDialog.index] && plans[infoDialog.index] && (
        <ScoutInfoDialog
          kind={infoDialog.kind}
          suggestion={suggestions[infoDialog.index]!}
          plan={plans[infoDialog.index]!}
          crewSize={travelers}
          currency={currency}
          locale={locale}
          origin={originCity.trim()}
          nonstopOnly={false}
          why={whyFor(
            infoDialog.index,
            plans[infoDialog.index]!,
            suggestions[infoDialog.index]!
          )}
          onClose={() => setInfoDialog(null)}
        />
      )}
    </Dialog>
  );
}
