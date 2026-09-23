"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronDown, Clock3, MapPin, Plus, Sun, Cloud, Droplets } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { getCurrentDatabase } from "@/lib/db/dexie";
import { cn } from "@/lib/utils";
import type { Trip } from "@/features/domain/entities";
import type { TimelineItem } from "@/features/trips/lib/home-trips";
import { getTripCoverGradient, isTripCoverImage } from "@/features/trips/lib/trip-cover";
import { activityDateTime, tripTabPath, formatTimeInZone, getTemporalState, type TemporalState } from "@/features/trips/lib/home-trips";
import { weatherRepository } from "@/features/weather/data/dexie-weather-repository";
import { weatherCodeSummary } from "@/features/weather/domain/weather-warnings";
import { loadTripWeatherForecast } from "@/features/weather/lib/load-trip-weather-forecast";
import type { DailyForecast, TripWeatherForecast } from "@/features/weather/domain/weather-types";

const LIVE_DOT_ANIMATION = {
  animate: { opacity: [1, 0.3, 1] },
  transition: { duration: 1.5, repeat: Infinity, ease: "easeInOut" },
} as const;

function destinationTimeZone(trip: Trip): string | null {
  if (trip.timeZone) return trip.timeZone;
  const destination = trip.destination?.toLowerCase() ?? "";
  if (destination.includes("lisbon")) return "Europe/Lisbon";
  if (destination.includes("tokyo") || destination.includes("kyoto")) return "Asia/Tokyo";
  if (destination.includes("torres del paine") || destination.includes("patagonia")) return "America/Punta_Arenas";
  return null;
}

interface LiveTimelineHudProps {
  trip: Trip;
  items: TimelineItem[];
  active: boolean;
  userId: string;
}

export function LiveTimelineHud({ trip, items, active, userId }: LiveTimelineHudProps) {
  const coverUrl = isTripCoverImage(trip.coverImageUrl) ? trip.coverImageUrl : null;
  const gradient = getTripCoverGradient(trip.coverImageUrl);
  const label = trip.destination ?? trip.name;
  const timeZone = destinationTimeZone(trip);

  const [selectedActivity, setSelectedActivity] = useState<TimelineItem | null>(null);
  const [weather, setWeather] = useState<TripWeatherForecast | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [pastLimit, setPastLimit] = useState(0);
  const [futureExtra, setFutureExtra] = useState(0);
  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!getCurrentDatabase()) return;
    return weatherRepository.watchForecast(trip.id, (forecast) => setWeather(forecast ?? null));
  }, [trip.id]);
  useEffect(() => {
    if (!getCurrentDatabase()) return;
    let cancelled = false;
    const refresh = () => {
      void loadTripWeatherForecast(trip, userId, true, 0.25)
        .then((result) => {
          if (!cancelled && (result.status === "hit" || result.status === "fetched" || result.status === "stale-offline")) setWeather(result.forecast);
        })
        .finally(() => {
          if (!cancelled) setWeatherLoading(false);
        });
    };
    refresh();
    const interval = window.setInterval(refresh, 15 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [trip, userId]);

  // Compute temporal states for each item
  const itemsWithState = useMemo(
    () => {
      const now = new Date();
      return items.map((item) => ({
        ...item,
        formattedTime: formatTimeInZone(item.startTime ?? null, timeZone),
        state: getTemporalState(
          { startTime: item.startTime ?? null, endTime: item.endTime ?? null, dayDate: item.dayDate },
          now,
          timeZone
        ),
      }));
    },
    [items, timeZone]
  );

  // Separate past, current, future
  const pastItems = useMemo(() => itemsWithState.filter((i) => i.state === "past"), [itemsWithState]);
  const currentItem = itemsWithState.find((i) => i.state === "current");
  const futureItems = useMemo(() => itemsWithState.filter((i) => i.state === "future"), [itemsWithState]);

  const now = new Date();
  // Time until next activity
  const timeUntilNext = currentItem
    ? null
    : futureItems.length > 0
    ? getTimeUntil(futureItems[0], now, timeZone)
    : null;

  const initialFutureLimit = 1;
  const displayFuture = futureItems.slice(0, initialFutureLimit + futureExtra);
  const displayPast = pastItems.slice(Math.max(0, pastItems.length - pastLimit));

  function handleShowPast() {
    setPastLimit((limit) => limit >= pastItems.length ? 0 : Math.min(pastItems.length, limit + 3));
    requestAnimationFrame(() => timelineRef.current?.scrollTo({ top: 0, behavior: "smooth" }));
  }

  return (
    <section className="rounded-2xl border bg-card p-5" aria-label={active ? "Live timeline" : "Upcoming itinerary"}>
      {/* Trip cover header with current time & weather */}
      <div className="mb-4">
        {coverUrl ? (
          <div className="relative -m-5 mb-4 h-28 overflow-hidden rounded-t-2xl">
            <Image src={coverUrl} alt={label} fill sizes="(max-width: 768px) 100vw, 50vw" unoptimized className="object-cover" />
            <div className="absolute inset-0 bg-linear-to-t from-black/60 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-3 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
              <p className="text-lg font-bold text-white drop-shadow">{label}</p>
              <CurrentWeather timeZone={timeZone} weather={weather} loading={weatherLoading} tone="dark" />
            </div>
          </div>
        ) : gradient ? (
          <div className={cn("-m-5 mb-4 flex h-24 items-end rounded-t-2xl px-4 pb-2", gradient.className)}>
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 w-full">
              <p className="text-lg font-bold text-white drop-shadow">{label}</p>
              <CurrentWeather timeZone={timeZone} weather={weather} loading={weatherLoading} tone="dark" />
            </div>
          </div>
        ) : (
          <div className="-m-5 mb-4 flex h-20 items-end rounded-t-2xl bg-muted px-4 pb-2">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 w-full">
              <p className="text-lg font-bold text-foreground">{label}</p>
              <CurrentWeather timeZone={timeZone} weather={weather} loading={weatherLoading} tone="light" />
            </div>
          </div>
        )}
      </div>

      {/* Header with next-activity chip */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h2 className="text-base font-semibold">
          {active ? "Today at a glance" : `Up next in ${label}`}
        </h2>
        {timeUntilNext && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-viatik-magenta/10 px-3 py-1 text-sm font-semibold text-viatik-magenta">
            <Clock3 className="size-3.5" aria-hidden />
            Next in {timeUntilNext}
          </span>
        )}
      </div>

      {pastItems.length > 0 && (
        <Button variant="ghost" size="sm" className="mb-2 w-full justify-center" onClick={handleShowPast}>
          <ChevronDown className={cn("size-4 transition-transform", pastLimit === 0 && "rotate-180")} aria-hidden />
          {pastLimit === 0 ? "Show past" : pastLimit < pastItems.length ? "Show more past" : "Hide past"}
        </Button>
      )}

      <div ref={timelineRef} className="max-h-72 overflow-y-auto pr-2">
        <div className="relative space-y-2">
          <div className="absolute bottom-0 left-4.5 top-0 w-0.5 bg-border/40" aria-hidden />
          {displayPast.map((item) => (
            <TimelineItem key={item.id} item={item as TimelineItem & { formattedTime: string | null; state: TemporalState }} isCurrent={false} isLast={false} active={active} onClick={() => setSelectedActivity(item)} />
          ))}
          {currentItem && (
            <TimelineItem key={currentItem.id} item={currentItem as TimelineItem & { formattedTime: string | null; state: TemporalState }} isCurrent isLast={displayFuture.length === 0} active={active} onClick={() => setSelectedActivity(currentItem)} />
          )}
          {displayFuture.map((item, index) => (
            <TimelineItem key={item.id} item={item as TimelineItem & { formattedTime: string | null; state: TemporalState }} isCurrent={false} isLast={index === displayFuture.length - 1} active={active} onClick={() => setSelectedActivity(item)} />
          ))}
        </div>

        {/* Empty state */}
        {itemsWithState.length === 0 && (
          <div className="text-center py-8">
            <Clock3 className="size-12 mx-auto text-muted-foreground/30" aria-hidden />
            <p className="mt-2 text-sm text-muted-foreground">
              {active ? "Nothing scheduled today — enjoy a slow morning." : "No activities planned yet."}
            </p>
            <Button
              className="mt-4"
              size="sm"
              onClick={() => window.location.href = tripTabPath(trip.id, "itinerary")}
            >
              <Plus className="size-4 mr-1.5" aria-hidden />
              Add activity
            </Button>
          </div>
        )}
      </div>

      {futureItems.length > initialFutureLimit + futureExtra && (
        <Button variant="ghost" size="sm" className="mt-2 w-full justify-center" onClick={() => setFutureExtra((extra) => extra + 3)}>
          <ChevronDown className="size-4" aria-hidden />
          Show next
        </Button>
      )}

      <footer className="mt-5 flex justify-end border-t pt-4">
        <Button asChild variant="outline" className="shrink-0">
          <Link href={tripTabPath(trip.id, "itinerary")}>
            Go to itinerary <ArrowRight className="size-4" aria-hidden />
          </Link>
        </Button>
      </footer>

      {/* Activity detail modal */}
      {selectedActivity && (
        <ActivityDetailModal
          activity={selectedActivity as TimelineItem & { formattedTime: string | null; state: TemporalState }}
          timeZone={timeZone}
          weather={weather}
          onClose={() => setSelectedActivity(null)}
        />
      )}
    </section>
  );
}

function dateKeyInZone(date: Date, timeZone: string | null): string {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: timeZone ?? undefined }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function currentWeather(forecast: DailyForecast, timeZone: string | null, now: Date) {
  const dayKey = dateKeyInZone(now, timeZone);
  const dayIndex = Math.max(0, forecast.dates.indexOf(dayKey));
  const hourly = forecast.hourly;
  if (hourly?.times.length) {
    const candidates = hourly.times.map((time, index) => ({ time: new Date(time).getTime(), index })).filter(({ time }) => Number.isFinite(time));
    const closest = candidates.reduce((best, candidate) => Math.abs(candidate.time - now.getTime()) < Math.abs(best.time - now.getTime()) ? candidate : best, candidates[0]);
    return {
      temperature: hourly.temperature2m[closest.index] ?? null,
      precipitation: hourly.precipitationProbability[closest.index] ?? 0,
      weatherCode: hourly.weatherCode[closest.index] ?? forecast.weatherCode[dayIndex] ?? 0,
    };
  }
  return {
    temperature: forecast.temperature2mMax[dayIndex] ?? null,
    precipitation: forecast.precipitationSum[dayIndex] ?? 0,
    weatherCode: forecast.weatherCode[dayIndex] ?? 0,
  };
}

function CurrentWeather({ timeZone, weather, loading, tone = "light" }: { timeZone: string | null; weather: TripWeatherForecast | null; loading: boolean; tone?: "light" | "dark" }) {
  if (loading) {
    return <span className={cn("text-sm animate-pulse", tone === "dark" ? "text-white/80" : "text-foreground/70")}>Loading weather…</span>;
  }

  const current = weather ? currentWeather(weather.forecast, timeZone, new Date()) : null;
  const condition = weatherCodeSummary(current?.weatherCode ?? 0);
  const IconComponent = condition.icon === "rain" ? Droplets : condition.icon === "sun" ? Sun : Cloud;
  const iconColor = condition.icon === "rain"
    ? tone === "dark" ? "text-sky-300" : "text-sky-600"
    : condition.icon === "sun"
      ? tone === "dark" ? "text-yellow-300" : "text-amber-600"
      : tone === "dark" ? "text-slate-200" : "text-slate-600";
  const temperature = current?.temperature != null ? `${Math.round(current.temperature)}°C` : "Weather unavailable";

  return (
    <div
      className={cn("flex items-center gap-2 rounded-full border px-3 py-2 shadow-sm backdrop-blur-md", tone === "dark" ? "border-white/25 bg-black/35" : "border-border bg-background/95")}
      aria-label={`${condition.label}, ${temperature}`}
    >
      <IconComponent className={cn("size-7 shrink-0 stroke-[2.5]", iconColor)} aria-hidden />
      <span className={cn("flex flex-col leading-tight", tone === "dark" ? "text-white" : "text-foreground")}>
        <span className="text-lg font-bold tabular-nums">{temperature}</span>
        <span className={cn("text-xs font-semibold", tone === "dark" ? "text-white/75" : "text-muted-foreground")}>{condition.label}</span>
      </span>
      {current && current.precipitation > 0 && (
        <span className={cn("flex items-center gap-0.5 text-xs font-semibold", tone === "dark" ? "text-sky-200" : "text-sky-700")}>
          <Droplets className="size-3" aria-hidden />
          {Math.round(current.precipitation)}%
        </span>
      )}
    </div>
  );
}

function getTimeUntil(item: TimelineItem, now: Date, timeZone: string | null): string | null {
  if (!item.startTime) return null;
  const start = activityDateTime(item.startTime, item.dayDate, timeZone);
  if (Number.isNaN(start.getTime())) return null;
  const diffMs = start.getTime() - now.getTime();
  if (diffMs <= 0) return null;
  const hours = Math.floor(diffMs / 3_600_000);
  const minutes = Math.floor((diffMs % 3_600_000) / 60_000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

interface TimelineItemProps {
  item: TimelineItem & { formattedTime: string | null; state: TemporalState };
  isCurrent: boolean;
  isLast: boolean;
  active: boolean;
  onClick: () => void;
}

function TimelineItem({
  item,
  isCurrent,
  isLast,
  active,
  onClick,
}: TimelineItemProps) {
  const { formattedTime, state, title, location, category } = item;

  // Static styles per temporal state
  const pastStyle = { opacity: 0.5, filter: "grayscale(1)" };
  const currentStyle = { opacity: 1, filter: "grayscale(0)", scale: 1.02 };
  const futureStyle = { opacity: 1, filter: "grayscale(0)" };

  const targetStyle = isCurrent ? currentStyle : state === "past" ? pastStyle : futureStyle;

  return (
    <motion.li
      layout
      initial={targetStyle}
      animate={targetStyle}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="relative group cursor-pointer"
      style={targetStyle}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
    >
      {/* Timeline dot + spine connector */}
      <div className="absolute left-4.5 top-0 -translate-x-1/2 z-10 flex flex-col items-center">
        <motion.div
          className={cn(
            "size-2.5 rounded-full border-2 border-card",
            state === "current" && "bg-viatik-magenta border-viatik-magenta shadow-[0_0_0_2px_rgba(168,85,247,0.3)]",
            state === "past" && "bg-border/40",
            state === "future" && "bg-background border-primary/20"
          )}
          animate={isCurrent ? LIVE_DOT_ANIMATION : {}}
        />
        {!isLast && (
          <motion.div
            className="h-full w-0.5 bg-border/40"
            initial={false}
            animate={{ height: state === "past" ? "100%" : "0%" }}
            transition={{ duration: 0.3 }}
          />
        )}
      </div>

      {/* Activity card */}
      <motion.div
        className={cn(
          "relative ml-8 flex items-center gap-3 rounded-xl border border-border/60 bg-background/60 p-3",
          state === "current" && "ring-2 ring-viatik-magenta/30 bg-viatik-magenta/5",
          state === "past" && "opacity-50 grayscale hover:opacity-50",
          state === "future" && "hover:bg-background hover:border-border/40"
        )}
        initial={targetStyle}
        animate={targetStyle}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        {/* Time badge */}
        <div className="shrink-0 flex items-center gap-2">
          {formattedTime && (
            <span className={cn(
              "text-xs font-mono tabular-nums",
              state === "current" && "text-viatik-magenta font-bold",
              state === "past" && "text-muted-foreground/60",
              state === "future" && "text-muted-foreground"
            )}>
              {formattedTime}
            </span>
          )}
          {!formattedTime && (
            <span className="grid size-7 place-items-center rounded-full bg-primary/10 text-primary">
              <Clock3 className="size-3.5" aria-hidden />
            </span>
          )}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <span className={cn(
            "block truncate text-sm font-semibold",
            state === "current" && "text-viatik-magenta",
            state === "past" && "text-foreground/60",
            state === "future" && "text-foreground"
          )}>
            {title}
          </span>
          {(location || category) && (
            <span className="mt-0.5 flex flex-wrap gap-1.5 text-xs text-muted-foreground/80">
              {location && (
                <span className="flex items-center gap-1">
                  <MapPin className="size-3" aria-hidden /> {location}
                </span>
              )}
              {category && (
                <span className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                  state === "current" && "bg-viatik-magenta/10 text-viatik-magenta",
                  state === "past" && "bg-muted/50 text-muted-foreground/60",
                  state === "future" && "bg-muted text-muted-foreground"
                )}>
                  {category}
                </span>
              )}
            </span>
          )}
        </div>

        {/* "Live" indicator for current activity */}
        {isCurrent && active && (
          <motion.div
            className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] font-semibold text-viatik-magenta"
            animate={LIVE_DOT_ANIMATION}
          >
            <span className="relative flex h-1.5 w-1.5 rounded-full bg-viatik-magenta" />
            <span>Live</span>
          </motion.div>
        )}
      </motion.div>
    </motion.li>
  );
}

interface ActivityDetailModalProps {
  activity: TimelineItem & { formattedTime: string | null; state: TemporalState };
  timeZone: string | null;
  weather: TripWeatherForecast | null;
  onClose: () => void;
}


function ActivityDetailModal({
  activity,
  timeZone,
  weather,
  onClose,
}: ActivityDetailModalProps) {
  const start = activity.startTime ? new Date(activity.startTime) : null;
  const end = activity.endTime ? new Date(activity.endTime) : null;

  return (
    <>
      <motion.div
        className="fixed inset-0 z-50 bg-black/50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="fixed inset-x-0 bottom-0 z-50 max-h-[90vh] overflow-y-auto rounded-t-2xl border border-border bg-card p-5 sm:p-6"
        initial={{ opacity: 0, y: 100 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 100 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="absolute right-4 top-4 grid size-9 place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition"
          onClick={onClose}
          aria-label="Close"
        >
          <ChevronDown className="size-5" aria-hidden />
        </button>

        {/* Header with time & weather */}
        <div className="mb-4 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{activity.dayDate}</p>
            <p className="font-mono text-lg font-semibold">{activity.formattedTime ?? "All day"}</p>
          </div>
          <CurrentWeather timeZone={timeZone} weather={weather} loading={false} />
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold">{activity.title}</h3>
          {(activity.location || activity.category) && (
            <div className="flex flex-wrap gap-2 text-sm">
              {activity.location && (
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted/50 text-muted-foreground">
                  <MapPin className="size-3.5" aria-hidden /> {activity.location}
                </span>
              )}
              {activity.category && (
                <span className="px-3 py-1 rounded-full bg-viatik-magenta/10 text-viatik-magenta text-sm font-semibold">
                  {activity.category}
                </span>
              )}
            </div>
          )}
          {start && end && (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock3 className="size-3.5" aria-hidden />
                {start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: timeZone ?? undefined })}
              </span>
              <span className="flex items-center gap-1">
                <Clock3 className="size-3.5" aria-hidden />
                {end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: timeZone ?? undefined })}
              </span>
            </div>
          )}
        </div>

        <div className="mt-6 pt-4 border-t">
          <Button className="w-full" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </motion.div>
    </>
  );
}