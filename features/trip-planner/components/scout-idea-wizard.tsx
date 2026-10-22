"use client";

import Image from "next/image";
import {
  ArrowLeft,
  ArrowRight,
  BedDouble,
  CalendarClock,
  ChevronDown,
  Compass,
  LoaderCircle,
  Plane,
  Plus,
  Sparkles,
  Wallet,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";

import { generateScoutTripIdeas } from "@/app/actions/scout-trip-ideas";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMinorUnits, getCurrencyExponent, parseMinorUnits } from "@/features/domain/money";
import {
  tripIdeaRepository,
  tripSavingsPlanRepository,
} from "@/features/trip-planner/data/dexie-trip-planner-repository";
import { buildScoutIdeaPlan, type ScoutIdeaPlan } from "@/features/trip-planner/domain/scout-idea-plan";
import { mapScoutIdeaToTripIdea } from "@/features/trip-planner/domain/scout-trip-idea-mapping";
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
import { useI18n } from "@/lib/i18n/i18n-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { cn } from "@/lib/utils";

const VIBE_CHIPS: Array<{ value: string; key: TranslationKey }> = [
  { value: "Beach and slow mornings", key: "copy.scoutWizardVibeBeach" },
  { value: "A lively city break", key: "copy.scoutWizardVibeCity" },
  { value: "Nature and fresh air", key: "copy.scoutWizardVibeNature" },
];

const CREW_CHOICES: Array<{ size: number; key: TranslationKey }> = [
  { size: 1, key: "copy.scoutWizardCrewSolo" },
  { size: 2, key: "copy.scoutWizardCrewPartner" },
  { size: 3, key: "copy.scoutWizardCrewFriends" },
];

const TIMING_CHOICES: Array<{ value: ScoutTripIdeasInput["timing"]; key: TranslationKey }> = [
  { value: "asap", key: "copy.scoutWizardTimingAsap" },
  { value: "month", key: "copy.scoutWizardTimingMonth" },
  { value: "cheapest", key: "copy.scoutWizardTimingCheapest" },
];

const LENGTH_CHOICES: Array<{ value: ScoutTripIdeasInput["tripLength"]; key: TranslationKey }> = [
  { value: "any", key: "copy.scoutWizardLengthAny" },
  { value: "weekend", key: "copy.scoutWizardLengthWeekend" },
  { value: "week", key: "copy.scoutWizardLengthWeek" },
  { value: "two-weeks", key: "copy.scoutWizardLengthTwoWeeks" },
];

const COMFORT_CHOICES: Array<{ value: ScoutTripIdeasInput["comfort"]; key: TranslationKey }> = [
  { value: "budget", key: "copy.scoutWizardComfortBudget" },
  { value: "balanced", key: "copy.scoutWizardComfortBalanced" },
  { value: "premium", key: "copy.scoutWizardComfortPremium" },
];

const STAY_CHOICES: Array<{ value: ScoutTripIdeasInput["stayStyle"]; key: TranslationKey }> = [
  { value: "hotel", key: "copy.scoutWizardStayHotel" },
  { value: "rental", key: "copy.scoutWizardStayRental" },
  { value: "either", key: "copy.scoutWizardStayEither" },
];

/** Required question screens: vibe, crew, savings, origin, timing. */
const TOTAL_REQUIRED_STEPS = 5;
/** Optional final screen that bundles the remaining refinements. */
const FINE_TUNE_STEP = TOTAL_REQUIRED_STEPS;

const EASE: [number, number, number, number] = [0.23, 1, 0.32, 1];
const CARD_ENTER_MS = 0.24;
const CARD_STAGGER_MS = 0.04;
const CARD_STAGGER_CAP = 4;
const TYPEWRITER_MS = 10;
const TYPEWRITER_MAX_MS = 700;

type Suggestion = ScoutTripIdeaSuggestion;

type FineTune = {
  tripLength: ScoutTripIdeasInput["tripLength"];
  comfort: ScoutTripIdeasInput["comfort"];
  stayStyle: ScoutTripIdeasInput["stayStyle"];
  nonstopOnly: boolean;
  constraints: string;
};

const DEFAULT_FINE_TUNE: FineTune = {
  tripLength: "any",
  comfort: "balanced",
  stayStyle: "either",
  nonstopOnly: false,
  constraints: "",
};

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

function DetailRow({
  icon,
  label,
  detail,
  amount,
  emphasis = false,
}: {
  icon?: ReactNode;
  label: string;
  detail: string;
  amount: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={
        emphasis
          ? "flex items-start justify-between gap-3 border-t border-border/60 pt-3"
          : "flex items-start justify-between gap-3"
      }
    >
      <div className="min-w-0">
        <dt className="flex items-center gap-2 text-sm font-medium">
          {icon}
          {label}
        </dt>
        <dd className="mt-0.5 text-xs text-muted-foreground">{detail}</dd>
      </div>
      <dd className={emphasis ? "shrink-0 font-semibold tabular-nums" : "shrink-0 tabular-nums"}>
        {amount}
      </dd>
    </div>
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

function IdeaDetails({
  suggestion,
  plan,
  crewSize,
  currency,
  locale,
  onOpenFlights,
  onOpenStay,
}: {
  suggestion: Suggestion;
  plan: ScoutIdeaPlan;
  crewSize: number;
  currency: string;
  locale: string;
  onOpenFlights: () => void;
  onOpenStay: () => void;
}) {
  const { t } = useI18n();
  const cadenceLabel =
    plan.savings.cadence === "weekly" ? t("copy.scoutWizardWeekly") : t("copy.scoutWizardMonthly");

  return (
    <div className="space-y-6">
      <section className="space-y-3" aria-labelledby={`budget-${suggestion.destination}`}>
        <h4
          id={`budget-${suggestion.destination}`}
          className="flex items-center gap-2 text-sm font-semibold"
        >
          <Wallet aria-hidden className="size-4 text-viatik-blue" />
          {t("copy.scoutIdeaBudgetHeading", { travelers: crewSize })}
        </h4>
        <dl className="space-y-2">
          <DetailRow
            icon={<Plane aria-hidden className="size-4 text-muted-foreground" />}
            label={t("copy.scoutIdeaBudgetFlights")}
            detail={t("copy.scoutIdeaBudgetFlightsDetail", {
              amount: formatMinorUnits(plan.flightTotalMinor / BigInt(crewSize), currency),
              travelers: crewSize,
            })}
            amount={formatMinorUnits(plan.flightTotalMinor, currency)}
          />
          <DetailRow
            icon={<BedDouble aria-hidden className="size-4 text-muted-foreground" />}
            label={t("copy.scoutIdeaBudgetStay")}
            detail={t("copy.scoutIdeaBudgetStayDetail", {
              amount: formatMinorUnits(plan.stay.nightlyHotelMinor, currency),
              nights: plan.nights,
            })}
            amount={formatMinorUnits(plan.stay.hotelTotalMinor, currency)}
          />
          <DetailRow
            label={t("copy.scoutIdeaBudgetDaily")}
            detail={t("copy.scoutIdeaBudgetDailyDetail", {
              amount: formatMinorUnits(
                plan.dailyTotalMinor / BigInt(crewSize * suggestion.ideal_duration_days),
                currency
              ),
              days: suggestion.ideal_duration_days,
              travelers: crewSize,
            })}
            amount={formatMinorUnits(plan.dailyTotalMinor, currency)}
          />
          <DetailRow
            label={t("copy.scoutIdeaBudgetTotal")}
            detail=""
            amount={formatMinorUnits(plan.grandTotalMinor, currency)}
            emphasis
          />
        </dl>
      </section>

      <section className="space-y-2" aria-labelledby={`timeline-${suggestion.destination}`}>
        <h4
          id={`timeline-${suggestion.destination}`}
          className="flex items-center gap-2 text-sm font-semibold"
        >
          <CalendarClock aria-hidden className="size-4 text-viatik-magenta" />
          {t("copy.scoutIdeaSavingsHeading")}
        </h4>
        {plan.savings.withinReach ? (
          <>
            <p className="text-sm">
              {t("copy.scoutIdeaSavingsDetail", {
                amount: formatMinorUnits(plan.savings.contributionMinor, currency),
                cadence: cadenceLabel,
              })}
            </p>
            <p className="text-sm font-medium">
              {t("copy.scoutIdeaSavingsReady", { date: formatDay(plan.savings.readyOn, locale) })}
            </p>
          </>
        ) : (
          <p className="text-sm">{t("copy.scoutIdeaOutOfReach")}</p>
        )}
      </section>

      <section className="space-y-2" aria-labelledby={`flights-${suggestion.destination}`}>
        <h4
          id={`flights-${suggestion.destination}`}
          className="flex items-center gap-2 text-sm font-semibold"
        >
          <Plane aria-hidden className="size-4 text-viatik-blue" />
          {t("copy.scoutIdeaFlightsHeading")}
        </h4>
        <p className="text-sm">
          {t("copy.scoutIdeaFlightsWindow", {
            weeks: Math.round(plan.flights.bookingWindowDays / 7),
            date: formatDay(plan.flights.bookBy, locale),
          })}
        </p>
        <p className="text-sm">
          {t("copy.scoutIdeaFlightsDeparture", {
            earliest: formatDay(plan.flights.earliestDeparture, locale),
            latest: formatDay(plan.flights.latestDeparture, locale),
          })}
        </p>
        <p className="text-xs text-muted-foreground">{t("copy.scoutIdeaFlightsNote")}</p>
        <Button type="button" variant="outline" className="min-h-11" onClick={onOpenFlights}>
          <Plane aria-hidden />
          {t("copy.scoutIdeaFlightDetails")}
        </Button>
      </section>

      <section className="space-y-3" aria-labelledby={`stay-${suggestion.destination}`}>
        <h4
          id={`stay-${suggestion.destination}`}
          className="flex items-center gap-2 text-sm font-semibold"
        >
          <BedDouble aria-hidden className="size-4 text-viatik-magenta" />
          {t("copy.scoutIdeaStayHeading")}
        </h4>
        <dl className="space-y-2">
          <DetailRow
            label={t("copy.scoutIdeaStayHotel")}
            detail={t("copy.scoutIdeaStayPerNight", {
              amount: formatMinorUnits(plan.stay.nightlyHotelMinor, currency),
              total: formatMinorUnits(plan.stay.hotelTotalMinor, currency),
              nights: plan.nights,
            })}
            amount={formatMinorUnits(plan.stay.hotelTotalMinor, currency)}
          />
          <DetailRow
            label={t("copy.scoutIdeaStayAlt")}
            detail={t("copy.scoutIdeaStayPerNight", {
              amount: formatMinorUnits(plan.stay.nightlyAltMinor, currency),
              total: formatMinorUnits(plan.stay.altTotalMinor, currency),
              nights: plan.nights,
            })}
            amount={formatMinorUnits(plan.stay.altTotalMinor, currency)}
          />
        </dl>
        {plan.stay.altSavingsMinor > 0n && (
          <p className="text-sm font-medium text-success">
            {t("copy.scoutIdeaStaySaving", {
              amount: formatMinorUnits(plan.stay.altSavingsMinor, currency),
            })}
          </p>
        )}
        {plan.stay.altSavingsMinor < 0n && (
          <p className="text-sm text-muted-foreground">
            {t("copy.scoutIdeaStayExtra", {
              amount: formatMinorUnits(-plan.stay.altSavingsMinor, currency),
            })}
          </p>
        )}
        <p className="text-xs text-muted-foreground">{t("copy.scoutIdeaStayNote")}</p>
        <Button type="button" variant="outline" className="min-h-11" onClick={onOpenStay}>
          <BedDouble aria-hidden />
          {t("copy.scoutIdeaStayDetails")}
        </Button>
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
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: T; key: TranslationKey }>;
  value: T;
  onChange: (value: T) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
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

export function ScoutIdeaWizard({
  open,
  onOpenChange,
  onManualAdd,
  currency,
  isOnline,
  defaultOrigin = "",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onManualAdd: () => void;
  currency: string;
  isOnline: boolean | null;
  defaultOrigin?: string;
}) {
  const { t, locale } = useI18n();
  const reducedMotion = useReducedMotion() ?? false;
  const [step, setStep] = useState(0);
  const [vibe, setVibe] = useState("");
  const [crewSize, setCrewSize] = useState<number | null>(null);
  const [savingsAmount, setSavingsAmount] = useState("");
  const [savingsCadence, setSavingsCadence] = useState<"weekly" | "monthly">("monthly");
  const [originCity, setOriginCity] = useState(defaultOrigin);
  const [timing, setTiming] = useState<ScoutTripIdeasInput["timing"]>("asap");
  const [targetMonth, setTargetMonth] = useState("");
  const [tripLength, setTripLength] = useState<FineTune["tripLength"]>(DEFAULT_FINE_TUNE.tripLength);
  const [comfort, setComfort] = useState<FineTune["comfort"]>(DEFAULT_FINE_TUNE.comfort);
  const [stayStyle, setStayStyle] = useState<FineTune["stayStyle"]>(DEFAULT_FINE_TUNE.stayStyle);
  const [nonstopOnly, setNonstopOnly] = useState(false);
  const [constraints, setConstraints] = useState("");
  const [savingsCapacityMinor, setSavingsCapacityMinor] = useState(0n);
  const [consented, setConsented] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [addingMore, setAddingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);
  const [infoDialog, setInfoDialog] = useState<{ kind: "flights" | "stay"; index: number } | null>(
    null
  );

  function reset() {
    setStep(0);
    setVibe("");
    setCrewSize(null);
    setSavingsAmount("");
    setSavingsCadence("monthly");
    setOriginCity(defaultOrigin);
    setTiming("asap");
    setTargetMonth("");
    setTripLength(DEFAULT_FINE_TUNE.tripLength);
    setComfort(DEFAULT_FINE_TUNE.comfort);
    setStayStyle(DEFAULT_FINE_TUNE.stayStyle);
    setNonstopOnly(false);
    setConstraints("");
    setSavingsCapacityMinor(0n);
    setConsented(false);
    setSuggestions([]);
    setError(null);
    setLoading(false);
    setAddingMore(false);
    setExhausted(false);
    setSavingIndex(null);
    setExpandedIndex(0);
    setInfoDialog(null);
  }

  function close(openNext: boolean) {
    onOpenChange(openNext);
    if (!openNext) reset();
  }

  async function callScout({
    savingsMinor,
    count,
    excludeDestinations,
    fineTune,
  }: {
    savingsMinor: bigint;
    count: number;
    excludeDestinations: string[];
    fineTune: FineTune;
  }) {
    return generateScoutTripIdeas({
      vibe,
      crewSize: crewSize ?? 1,
      savingsCapacityMinor: savingsMinor.toString(),
      savingsCadence,
      currency: currency as ScoutTripIdeasInput["currency"],
      consentToAI: true,
      locale: locale === "es" ? "es" : "en",
      count,
      excludeDestinations,
      originCity: originCity.trim(),
      timing,
      targetMonth: timing === "month" && targetMonth ? targetMonth : null,
      tripLength: fineTune.tripLength,
      comfort: fineTune.comfort,
      stayStyle: fineTune.stayStyle,
      nonstopOnly: fineTune.nonstopOnly,
      constraints: fineTune.constraints.trim(),
    } satisfies ScoutTripIdeasInput);
  }

  async function askScout(fineTuneOverride?: FineTune) {
    setError(null);
    if (isOnline !== true) {
      setError(t("copy.scoutWizardNeedsConnection"));
      return;
    }
    if (!consented) {
      setError(t("copy.scoutWizardConsentRequired"));
      return;
    }
    if (!crewSize) {
      setError(t("copy.scoutWizardChooseCrew"));
      return;
    }

    let parsedSavings: bigint;
    try {
      parsedSavings = parseMinorUnits(savingsAmount, currency);
      if (parsedSavings === 0n) throw new Error("Enter a savings amount greater than zero.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Enter a valid savings amount.");
      return;
    }

    const fineTune = fineTuneOverride ?? { tripLength, comfort, stayStyle, nonstopOnly, constraints };

    setLoading(true);
    setExhausted(false);
    try {
      const result = await callScout({
        savingsMinor: parsedSavings,
        count: SCOUT_INITIAL_IDEA_COUNT,
        excludeDestinations: [],
        fineTune,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setSavingsCapacityMinor(parsedSavings);
      setSuggestions(result.suggestions.ideas);
      setExpandedIndex(0);
    } catch {
      setError("Scout couldn't connect just now. You can still add an idea manually.");
    } finally {
      setLoading(false);
    }
  }

  async function addMore() {
    setError(null);
    setAddingMore(true);
    try {
      const result = await callScout({
        savingsMinor: savingsCapacityMinor,
        count: SCOUT_MORE_IDEA_COUNT,
        excludeDestinations: suggestions.map((item) => item.destination),
        fineTune: { tripLength, comfort, stayStyle, nonstopOnly, constraints },
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      const fresh = result.suggestions.ideas;
      if (fresh.length < SCOUT_MORE_IDEA_COUNT) setExhausted(true);
      setSuggestions((current) => [...current, ...fresh]);
    } catch {
      setError("Scout couldn't connect just now. You can still add an idea manually.");
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
        vibe,
        crewSize: crewSize ?? 1,
        currency,
        cadence: savingsCadence,
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
  const travelers = crewSize ?? 1;
  const isFineTune = step === FINE_TUNE_STEP;
  const progressPercent =
    ((Math.min(step, TOTAL_REQUIRED_STEPS - 1) + 1) / TOTAL_REQUIRED_STEPS) * 100;

  const plans = suggestions.map((suggestion) =>
    buildScoutIdeaPlan({
      suggestion,
      crewSize: travelers,
      savingsCapacityMinor,
      savingsCadence,
      currency,
      timing,
      targetMonth: timing === "month" && targetMonth ? targetMonth : null,
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
        <header className="relative shrink-0 border-b border-border/60 bg-card/80 px-6 pb-4 pt-5 backdrop-blur-md">
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
                <p className="mt-1 text-sm text-muted-foreground">
                  {completedQuestion
                    ? t("copy.scoutWizardOptionsHeading", { count: suggestions.length })
                    : isFineTune
                      ? t("copy.scoutWizardOptional")
                      : t("copy.scoutWizardQuestionCount", {
                          current: step + 1,
                          total: TOTAL_REQUIRED_STEPS,
                        })}
                </p>
              </div>
            </div>
          </DialogHeader>
        </header>

        {!completedQuestion && !loading && isOnline !== false && (
          <div className="shrink-0 px-6 pt-4">
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Sparkles aria-hidden className="size-3.5 text-viatik-magenta" />
                {t("copy.scoutWizardScoutSays")}
              </span>
              <span>
                {t("copy.scoutWizardQuestionCount", {
                  current: Math.min(step + 1, TOTAL_REQUIRED_STEPS),
                  total: TOTAL_REQUIRED_STEPS,
                })}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <motion.div
                className="h-full rounded-full bg-viatik-gradient"
                initial={false}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 0.35, ease: EASE }}
              />
            </div>
          </div>
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
              {Array.from({ length: SCOUT_INITIAL_IDEA_COUNT }).map((_, index) => (
                <div
                  key={index}
                  className="animate-pulse rounded-2xl border border-border/60 bg-card p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="size-9 shrink-0 rounded-xl bg-muted" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-1/2 rounded bg-muted" />
                      <div className="h-2.5 w-1/3 rounded bg-muted" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : suggestions.length === 0 ? (
            <div className="space-y-5">
              <motion.div
                key={step}
                initial={reducedMotion ? false : { opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.24, ease: EASE }}
                className="space-y-4"
              >
                <div className="relative rounded-2xl border border-border/60 bg-muted/40 p-4">
                  <span
                    aria-hidden
                    className="absolute -top-2 left-5 size-4 rotate-45 border-l border-t border-border/60 bg-muted/40"
                  />
                  <h3 className="text-lg font-semibold">
                    <ScoutSpeech
                      text={
                        step === 0
                          ? t("copy.scoutWizardVibeQuestion")
                          : step === 1
                            ? t("copy.scoutWizardCrewQuestion")
                            : step === 2
                              ? t("copy.scoutWizardBudgetQuestion")
                              : step === 3
                                ? t("copy.scoutWizardOriginQuestion")
                                : t("copy.scoutWizardTimingQuestion")
                      }
                      reducedMotion={reducedMotion}
                      animate={step === 0}
                    />
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {step === 0
                      ? t("copy.scoutWizardVibeHelp")
                      : step === 1
                        ? t("copy.scoutWizardCrewHelp")
                        : step === 2
                          ? t("copy.scoutWizardBudgetHelp")
                          : step === 3
                            ? t("copy.scoutWizardOriginHelp")
                            : t("copy.scoutWizardTimingHelp")}
                  </p>
                </div>

                {step === 0 && (
                  <section className="space-y-4" aria-labelledby="scout-vibe-question">
                    <div className="flex flex-wrap gap-2">
                      {VIBE_CHIPS.map((option) => (
                        <Button
                          key={option.value}
                          type="button"
                          variant={vibe === option.value ? "default" : "outline"}
                          aria-pressed={vibe === option.value}
                          className="min-h-11 transition-all duration-200 ease-out active:scale-[0.98]"
                          onClick={() => {
                            setVibe(option.value);
                            setConsented(false);
                          }}
                        >
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
                        onChange={(event) => {
                          setVibe(event.target.value);
                          setConsented(false);
                        }}
                        placeholder={t("copy.scoutWizardVibePlaceholder")}
                      />
                    </div>
                  </section>
                )}

                {step === 1 && (
                  <section
                    className="grid gap-3"
                    style={{ gridTemplateColumns: "repeat(auto-fit, minmax(9rem, 1fr))" }}
                    aria-label={t("copy.scoutWizardCrewQuestion")}
                  >
                    {CREW_CHOICES.map((option) => (
                      <Button
                        key={option.size}
                        type="button"
                        variant={crewSize === option.size ? "default" : "outline"}
                        aria-pressed={crewSize === option.size}
                        className="min-h-12 whitespace-normal transition-all duration-200 ease-out active:scale-[0.98]"
                        onClick={() => {
                          setCrewSize(option.size);
                          setConsented(false);
                        }}
                      >
                        {t(option.key)}
                      </Button>
                    ))}
                  </section>
                )}

                {step === 2 && (
                  <section className="space-y-4" aria-labelledby="scout-wallet-question">
                    <div className="space-y-2">
                      <Label htmlFor="scout-savings">
                        {t("copy.scoutWizardSavingsLabel", { currency })}
                      </Label>
                      <Input
                        id="scout-savings"
                        inputMode="decimal"
                        value={savingsAmount}
                        onChange={(event) => {
                          setSavingsAmount(event.target.value);
                          setConsented(false);
                        }}
                        placeholder={currency === "JPY" ? "25000" : "250"}
                      />
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
                    <label className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm">
                      <input
                        type="checkbox"
                        checked={consented}
                        onChange={(event) => setConsented(event.target.checked)}
                        className="mt-1 size-4 accent-primary"
                      />
                      <span>{t("copy.scoutWizardConsent")}</span>
                    </label>
                  </section>
                )}

                {step === 3 && (
                  <section aria-labelledby="scout-origin-question">
                    <DestinationField
                      id="scout-origin"
                      value={originCity}
                      onChange={setOriginCity}
                      label={t("copy.scoutWizardOriginLabel")}
                      placeholder={t("copy.scoutWizardOriginPlaceholder")}
                      helpText={t("copy.scoutWizardOriginHelp")}
                    />
                  </section>
                )}

                {step === 4 && (
                  <section className="space-y-4" aria-labelledby="scout-timing-question">
                    <div className="flex flex-wrap gap-2">
                      {TIMING_CHOICES.map((option) => (
                        <Button
                          key={option.value}
                          type="button"
                          variant={timing === option.value ? "default" : "outline"}
                          aria-pressed={timing === option.value}
                          className="min-h-11 whitespace-normal"
                          onClick={() => setTiming(option.value)}
                        >
                          {t(option.key)}
                        </Button>
                      ))}
                    </div>
                    {timing === "month" && (
                      <div className="space-y-2">
                        <Label htmlFor="scout-target-month">
                          {t("copy.scoutWizardTimingMonthLabel")}
                        </Label>
                        <Input
                          id="scout-target-month"
                          type="month"
                          value={targetMonth}
                          onChange={(event) => setTargetMonth(event.target.value)}
                          className="h-11"
                        />
                      </div>
                    )}
                  </section>
                )}

                {isFineTune && (
                  <section className="space-y-5" aria-labelledby="scout-finetune-heading">
                    <div>
                      <h3 id="scout-finetune-heading" className="text-sm font-semibold">
                        {t("copy.scoutWizardFineTuneTitle")}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t("copy.scoutWizardFineTuneHelp")}
                      </p>
                    </div>
                    <ChoiceChips
                      label={t("copy.scoutWizardTripLength")}
                      options={LENGTH_CHOICES}
                      value={tripLength}
                      onChange={setTripLength}
                    />
                    <ChoiceChips
                      label={t("copy.scoutWizardComfort")}
                      options={COMFORT_CHOICES}
                      value={comfort}
                      onChange={setComfort}
                    />
                    <ChoiceChips
                      label={t("copy.scoutWizardStayStyle")}
                      options={STAY_CHOICES}
                      value={stayStyle}
                      onChange={setStayStyle}
                    />
                    <label className="flex items-center gap-3 rounded-xl border border-border p-3 text-sm">
                      <input
                        type="checkbox"
                        checked={nonstopOnly}
                        onChange={(event) => setNonstopOnly(event.target.checked)}
                        className="size-4 accent-primary"
                      />
                      <span>{t("copy.scoutWizardNonstop")}</span>
                    </label>
                    <div className="space-y-2">
                      <Label htmlFor="scout-constraints">{t("copy.scoutWizardConstraints")}</Label>
                      <Input
                        id="scout-constraints"
                        value={constraints}
                        maxLength={200}
                        onChange={(event) => setConstraints(event.target.value)}
                        placeholder={t("copy.scoutWizardConstraintsPlaceholder")}
                        className="h-11"
                      />
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

              <div className="flex justify-between gap-3 border-t border-border pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11"
                  disabled={step === 0 || loading}
                  onClick={() => {
                    setError(null);
                    setStep((current) => current - 1);
                  }}
                >
                  <ArrowLeft aria-hidden /> {t("copy.scoutWizardBack")}
                </Button>
                {isFineTune ? (
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      className="min-h-11"
                      disabled={loading || !consented || isOnline !== true}
                      onClick={() => void askScout(DEFAULT_FINE_TUNE)}
                    >
                      {t("copy.scoutWizardSkip")}
                    </Button>
                    <Button
                      type="button"
                      className="min-h-11 bg-viatik-gradient text-white transition-all duration-200 ease-out active:scale-[0.98]"
                      disabled={loading || !consented || isOnline !== true}
                      onClick={() => void askScout()}
                    >
                      <Sparkles aria-hidden />
                      {t("copy.scoutWizardFind")}
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    className="min-h-11 transition-all duration-200 ease-out active:scale-[0.98]"
                    disabled={(step === 0 && vibe.trim().length < 2) || (step === 1 && !crewSize)}
                    onClick={() => {
                      setError(null);
                      setStep((current) => current + 1);
                    }}
                  >
                    {t("copy.scoutWizardNext")} <ArrowRight aria-hidden />
                  </Button>
                )}
              </div>
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
              {suggestions.length < SCOUT_INITIAL_IDEA_COUNT && (
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
                  const summary = plan.savings.withinReach
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
                      className="w-[86vw] shrink-0 snap-center overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm sm:w-auto"
                    >
                      <div aria-hidden className="h-0.5 w-full bg-viatik-gradient" />
                      <button
                        type="button"
                        aria-expanded={expanded}
                        aria-controls={`scout-idea-${index}`}
                        onClick={() => setExpandedIndex(expanded ? null : index)}
                        className="flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                            <span className="truncate font-semibold">{suggestion.destination}</span>
                            {index === 0 && (
                              <span className="rounded-full bg-viatik-gradient px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                                {t("copy.scoutWizardBestMatch")}
                              </span>
                            )}
                            {tag && (
                              <span className="rounded-full bg-viatik-blue/10 px-2 py-0.5 text-[10px] font-medium text-viatik-blue">
                                {tag}
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {formatMinorUnits(plan.grandTotalMinor, currency)} ·{" "}
                            {t("copy.tripIdeaDurationDays", {
                              days: suggestion.ideal_duration_days,
                            })}
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
                        <div
                          id={`scout-idea-${index}`}
                          className="space-y-4 border-t border-border/40 px-4 pb-4 pt-4"
                        >
                          <p className="text-sm">{suggestion.scout_pitch}</p>
                          <p className="text-xs text-muted-foreground">{suggestion.best_season}</p>
                          <p className="text-xs font-medium text-muted-foreground">
                            {t("copy.scoutIdeaSearchTravelers")}: {travelers} ·{" "}
                            {t("copy.scoutIdeaSearchCabinEconomy")} ·{" "}
                            {nonstopOnly
                              ? t("copy.scoutIdeaSearchStopsNonstop")
                              : t("copy.scoutIdeaSearchStopsAny")}
                          </p>
                          <dl className="grid grid-cols-2 gap-3 text-sm">
                            <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
                              <dt className="text-muted-foreground">
                                {t("copy.scoutIdeaBudgetFlights")}
                              </dt>
                              <dd className="mt-1 font-semibold tabular-nums">
                                {formatMinorUnits(
                                  toMinorUnits(
                                    suggestion.estimated_flight_cost_per_person,
                                    currency
                                  ),
                                  currency
                                )}
                              </dd>
                            </div>
                            <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
                              <dt className="text-muted-foreground">
                                {t("copy.scoutIdeaBudgetTotal")}
                              </dt>
                              <dd className="mt-1 font-semibold tabular-nums">
                                {formatMinorUnits(plan.grandTotalMinor, currency)}
                              </dd>
                            </div>
                          </dl>
                          <p className="rounded-xl border-l-2 border-viatik-magenta bg-muted/40 p-3 text-sm">
                            {summary}
                          </p>
                          <IdeaDetails
                            suggestion={suggestion}
                            plan={plan}
                            crewSize={travelers}
                            currency={currency}
                            locale={locale}
                            onOpenFlights={() => setInfoDialog({ kind: "flights", index })}
                            onOpenStay={() => setInfoDialog({ kind: "stay", index })}
                          />
                          <Button
                            type="button"
                            className="min-h-11 w-full bg-viatik-gradient text-white transition-all duration-200 ease-out active:scale-[0.98]"
                            disabled={savingIndex !== null}
                            onClick={() => void saveSuggestion(suggestion, index)}
                          >
                            {savingIndex === index ? (
                              <LoaderCircle aria-hidden className="animate-spin" />
                            ) : null}
                            {t("copy.scoutWizardSaveIdea")}
                          </Button>
                        </div>
                      )}
                    </motion.article>
                  );
                })}

                {!exhausted && (
                  <button
                    type="button"
                    disabled={addingMore || isOnline !== true}
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
                    setStep(0);
                  }}
                >
                  <ArrowLeft aria-hidden /> {t("copy.scoutWizardTryAgain")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>

      {infoDialog && suggestions[infoDialog.index] && plans[infoDialog.index] && (
        <ScoutInfoDialog
          kind={infoDialog.kind}
          suggestion={suggestions[infoDialog.index]!}
          plan={plans[infoDialog.index]!}
          crewSize={travelers}
          currency={currency}
          locale={locale}
          origin={originCity.trim()}
          nonstopOnly={nonstopOnly}
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
