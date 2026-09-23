"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronDown, Clock3, Cloud, Droplets, ListChecks, MapPin, Plus, Sun } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getCurrentDatabase } from "@/lib/db/dexie";
import { cn } from "@/lib/utils";
import type { ActivityChecklistItem, Trip } from "@/features/domain/entities";
import type { TimelineItem } from "@/features/trips/lib/home-trips";
import { getTripCoverGradient, isTripCoverImage } from "@/features/trips/lib/trip-cover";
import {
  activityDateTime,
  tripTabPath,
  formatWallClockTime,
  getTemporalState,
  resolveScheduleTimeZone,
  resolveTripScheduleTimeZone,
  type TemporalState,
} from "@/features/trips/lib/home-trips";
import {
  ActivityChecklistProgressPill,
  ActivityChecklistQuickActions,
} from "@/features/activities/components/activity-checklist";
import { normalizeActivityChecklist } from "@/features/activities/domain/activity-checklist";
import { activityRepository } from "@/features/activities/data/dexie-activity-repository";
import type { ChecklistFeedAction } from "@/features/feed/lib/feed-builder";
import { weatherRepository } from "@/features/weather/data/dexie-weather-repository";
import { weatherCodeSummary } from "@/features/weather/domain/weather-warnings";
import { loadTripWeatherForecast } from "@/features/weather/lib/load-trip-weather-forecast";
import type { DailyForecast, TripWeatherForecast } from "@/features/weather/domain/weather-types";

const LIVE_DOT_ANIMATION = {
  animate: { opacity: [1, 0.3, 1] },
  transition: { duration: 1.5, repeat: Infinity, ease: "easeInOut" as const },
};

const INITIAL_VISIBLE_ITEMS = 3;

interface LiveTimelineHudProps {
  trip: Trip;
  items: TimelineItem[];
  active: boolean;
  userId: string;
}

/** Prefer live/upcoming stops inside a fixed window of `limit` items. */
export function visibleTimelineWindow<T extends { state: TemporalState }>(
  items: T[],
  expanded: boolean,
  limit = INITIAL_VISIBLE_ITEMS,
): T[] {
  if (expanded || items.length <= limit) return items;
  const firstLive = items.findIndex((item) => item.state !== "past");
  if (firstLive < 0) return items.slice(-limit);
  // Keep one trailing past stop for context when the window has room.
  const start = Math.max(0, firstLive - Math.min(1, limit - 1));
  return items.slice(start, start + limit);
}

export function LiveTimelineHud({ trip, items, active, userId }: LiveTimelineHudProps) {
  const coverUrl = isTripCoverImage(trip.coverImageUrl) ? trip.coverImageUrl : null;
  const gradient = getTripCoverGradient(trip.coverImageUrl);
  const label = trip.destination ?? trip.name;
  // Weather / forecast day keys stay on the trip destination zone.
  const weatherTimeZone = resolveTripScheduleTimeZone(trip);
  // Active "today" glance compares schedule wall clocks to the traveler's local
  // now so a stale remote trip.timeZone cannot mark evening stops as ended.
  const scheduleTimeZone = active ? resolveScheduleTimeZone(null) : weatherTimeZone;

  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [weather, setWeather] = useState<TripWeatherForecast | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const timelineRef = useRef<HTMLDivElement>(null);
  const timelineId = useId();
  const selectedActivity = selectedActivityId
    ? items.find((item) => item.id === selectedActivityId) ?? null
    : null;

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

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
          if (
            !cancelled &&
            (result.status === "hit" || result.status === "fetched" || result.status === "stale-offline")
          ) {
            setWeather(result.forecast);
          }
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

  const itemsWithState = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        formattedTime: formatWallClockTime(item.startTime ?? null),
        state: getTemporalState(
          { startTime: item.startTime ?? null, endTime: item.endTime ?? null, dayDate: item.dayDate },
          now,
          scheduleTimeZone,
        ),
        startsIn: getTimeUntil(item, now, scheduleTimeZone),
      })),
    [items, scheduleTimeZone, now],
  );

  const currentItem = itemsWithState.find((i) => i.state === "current");
  const futureItems = useMemo(() => itemsWithState.filter((i) => i.state === "future"), [itemsWithState]);
  const displayItems = useMemo(
    () => visibleTimelineWindow(itemsWithState, showAll, INITIAL_VISIBLE_ITEMS),
    [itemsWithState, showAll],
  );
  const hasMore = itemsWithState.length > INITIAL_VISIBLE_ITEMS;

  const timeUntilNext = currentItem
    ? null
    : futureItems.length > 0
      ? futureItems[0].startsIn
      : null;

  async function saveChecklist(
    activityId: string,
    checklist: ActivityChecklistItem[],
    event?: { action: ChecklistFeedAction; itemTitle: string },
  ) {
    const next = normalizeActivityChecklist(checklist);
    try {
      if (event) {
        await activityRepository.updateChecklist(activityId, next, event);
      } else {
        await activityRepository.update(activityId, { checklist: next });
      }
    } catch {
      // Live query restores authoritative local state if the write fails.
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-5" aria-label={active ? "Live timeline" : "Upcoming itinerary"}>
      <div className="mb-4">
        {coverUrl ? (
          <div className="relative -m-5 mb-4 h-28 overflow-hidden rounded-t-2xl">
            <Image src={coverUrl} alt={label} fill sizes="(max-width: 768px) 100vw, 50vw" unoptimized className="object-cover" />
            <div className="absolute inset-0 bg-linear-to-t from-black/60 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 flex flex-col gap-2 p-3 sm:flex-row sm:items-end sm:justify-between">
              <p className="text-lg font-bold text-white drop-shadow">{label}</p>
              <CurrentWeather timeZone={weatherTimeZone} weather={weather} loading={weatherLoading} tone="dark" />
            </div>
          </div>
        ) : gradient ? (
          <div className={cn("-m-5 mb-4 flex h-24 items-end rounded-t-2xl px-4 pb-2", gradient.className)}>
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <p className="text-lg font-bold text-white drop-shadow">{label}</p>
              <CurrentWeather timeZone={weatherTimeZone} weather={weather} loading={weatherLoading} tone="dark" />
            </div>
          </div>
        ) : (
          <div className="-m-5 mb-4 flex h-20 items-end rounded-t-2xl bg-muted px-4 pb-2">
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <p className="text-lg font-bold text-foreground">{label}</p>
              <CurrentWeather timeZone={weatherTimeZone} weather={weather} loading={weatherLoading} tone="light" />
            </div>
          </div>
        )}
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base font-semibold">
          {active ? "Today at a glance" : `Up next in ${label}`}
        </h2>
        {timeUntilNext && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-viatik-magenta/60 bg-viatik-magenta/5 px-3 py-1 text-sm font-semibold text-viatik-magenta">
            <Clock3 className="size-3.5" aria-hidden />
            Next in {timeUntilNext}
          </span>
        )}
      </div>

      <div id={timelineId} ref={timelineRef} className="max-h-[28rem] overflow-y-auto pr-2">
        <div className="relative space-y-2">
          <div className="absolute bottom-0 left-4.5 top-0 w-0.5 bg-border/40" aria-hidden />
          {displayItems.map((item, index) => (
            <TimelineCard
              key={item.id}
              item={item}
              isCurrent={item.state === "current"}
              isLast={index === displayItems.length - 1}
              tripActive={active}
              onClick={() => setSelectedActivityId(item.id)}
            />
          ))}
        </div>

        {itemsWithState.length === 0 && (
          <div className="py-8 text-center">
            <Clock3 className="mx-auto size-12 text-muted-foreground/30" aria-hidden />
            <p className="mt-2 text-sm text-muted-foreground">
              {active ? "Nothing scheduled today — enjoy a slow morning." : "No activities planned yet."}
            </p>
            <Button className="mt-4" size="sm" onClick={() => { window.location.href = tripTabPath(trip.id, "itinerary"); }}>
              <Plus className="mr-1.5 size-4" aria-hidden />
              Add activity
            </Button>
          </div>
        )}
      </div>

      {hasMore && (
        <Button
          variant="ghost"
          className="mx-auto mt-3 flex w-fit justify-center px-3 text-muted-foreground hover:bg-transparent hover:text-foreground hover:opacity-70"
          aria-expanded={showAll}
          aria-controls={timelineId}
          onClick={() => {
            setShowAll((value) => !value);
            if (!showAll) {
              requestAnimationFrame(() => timelineRef.current?.scrollTo({ top: timelineRef.current.scrollHeight, behavior: "smooth" }));
            }
          }}
        >
          <ChevronDown className={cn("size-4 transition-transform", showAll && "rotate-180")} aria-hidden />
          {showAll ? "Show less" : "Show more"}
        </Button>
      )}

      <footer className="mt-5 flex justify-end border-t pt-4">
        <Button asChild variant="outline" className="shrink-0">
          <Link href={tripTabPath(trip.id, "itinerary")}>
            Go to itinerary <ArrowRight className="size-4" aria-hidden />
          </Link>
        </Button>
      </footer>

      {selectedActivity && (
        <ActivityDetailModal
          activity={{
            ...selectedActivity,
            checklist: selectedActivity.checklist ?? [],
            formattedTime: formatWallClockTime(selectedActivity.startTime ?? null),
            state: getTemporalState(
              {
                startTime: selectedActivity.startTime ?? null,
                endTime: selectedActivity.endTime ?? null,
                dayDate: selectedActivity.dayDate,
              },
              now,
              scheduleTimeZone,
            ),
            startsIn: getTimeUntil(selectedActivity, now, scheduleTimeZone),
          }}
          timeZone={scheduleTimeZone}
          onClose={() => setSelectedActivityId(null)}
          onChecklistChange={(checklist, event) => void saveChecklist(selectedActivity.id, checklist, event)}
        />
      )}
    </section>
  );
}

function dateKeyInZone(date: Date, timeZone: string | null): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: timeZone ?? undefined,
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function currentWeather(forecast: DailyForecast, timeZone: string | null, now: Date) {
  const dayKey = dateKeyInZone(now, timeZone);
  const dayIndex = Math.max(0, forecast.dates.indexOf(dayKey));
  const hourly = forecast.hourly;
  if (hourly?.times.length) {
    const candidates = hourly.times
      .map((time, index) => ({ time: new Date(time).getTime(), index }))
      .filter(({ time }) => Number.isFinite(time));
    const closest = candidates.reduce(
      (best, candidate) =>
        Math.abs(candidate.time - now.getTime()) < Math.abs(best.time - now.getTime()) ? candidate : best,
      candidates[0],
    );
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

function CurrentWeather({
  timeZone,
  weather,
  loading,
  tone = "light",
}: {
  timeZone: string | null;
  weather: TripWeatherForecast | null;
  loading: boolean;
  tone?: "light" | "dark";
}) {
  if (loading) {
    return (
      <span className={cn("animate-pulse text-sm", tone === "dark" ? "text-white/80" : "text-foreground/70")}>
        Loading weather…
      </span>
    );
  }

  const current = weather ? currentWeather(weather.forecast, timeZone, new Date()) : null;
  const condition = weatherCodeSummary(current?.weatherCode ?? 0);
  const IconComponent = condition.icon === "rain" ? Droplets : condition.icon === "sun" ? Sun : Cloud;
  const iconColor =
    condition.icon === "rain"
      ? tone === "dark"
        ? "text-sky-300"
        : "text-sky-600"
      : condition.icon === "sun"
        ? tone === "dark"
          ? "text-yellow-300"
          : "text-amber-600"
        : tone === "dark"
          ? "text-slate-200"
          : "text-slate-600";
  const temperature = current?.temperature != null ? `${Math.round(current.temperature)}°C` : "Weather unavailable";

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full border px-3 py-2 shadow-sm backdrop-blur-md",
        tone === "dark" ? "border-white/25 bg-black/35" : "border-border bg-background/95",
      )}
      aria-label={`${condition.label}, ${temperature}`}
    >
      <IconComponent className={cn("size-7 shrink-0 stroke-[2.5]", iconColor)} aria-hidden />
      <span className={cn("flex flex-col leading-tight", tone === "dark" ? "text-white" : "text-foreground")}>
        <span className="text-lg font-bold tabular-nums">{temperature}</span>
        <span className={cn("text-xs font-semibold", tone === "dark" ? "text-white/75" : "text-muted-foreground")}>
          {condition.label}
        </span>
      </span>
      {current && current.precipitation > 0 && (
        <span
          className={cn(
            "flex items-center gap-0.5 text-xs font-semibold",
            tone === "dark" ? "text-sky-200" : "text-sky-700",
          )}
        >
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

type TimelineCardItem = TimelineItem & {
  formattedTime: string | null;
  state: TemporalState;
  startsIn: string | null;
};

function TimelineCard({
  item,
  isCurrent,
  isLast,
  tripActive,
  onClick,
}: {
  item: TimelineCardItem;
  isCurrent: boolean;
  isLast: boolean;
  tripActive: boolean;
  onClick: () => void;
}) {
  const { formattedTime, state, title, location, checklist, startsIn } = item;

  return (
    <motion.li
      layout
      initial={false}
      animate={{ scale: isCurrent ? 1.01 : 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn(
        "group relative transition-opacity duration-300 ease-out",
        state === "past" && "opacity-50 grayscale",
      )}
    >
      <div className="absolute left-4.5 top-0 z-10 flex -translate-x-1/2 flex-col items-center">
        <motion.div
          className={cn(
            "size-2.5 rounded-full border-2 border-card",
            state === "current" && "border-viatik-magenta bg-viatik-magenta shadow-[0_0_0_2px_rgba(168,85,247,0.3)]",
            state === "past" && "bg-border/40",
            state === "future" && "border-primary/20 bg-background",
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

      <motion.div
        className={cn(
          "relative ml-8 cursor-pointer rounded-xl border border-border/60 p-4 transition-all duration-200 ease-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          state === "current" &&
            "border-viatik-magenta/50 bg-viatik-magenta/10 ring-1 ring-viatik-magenta/30",
          state === "past" && "bg-muted/30",
          state === "future" && "bg-background/80 hover:border-viatik-magenta/30",
        )}
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        }}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {formattedTime && (
                <span
                  className={cn(
                    "font-mono text-xs tabular-nums",
                    state === "current" && "font-bold text-viatik-magenta",
                    state === "past" && "text-muted-foreground/60",
                    state === "future" && "text-muted-foreground",
                  )}
                >
                  {formattedTime}
                </span>
              )}
              {state === "past" && (
                <span className="inline-flex items-center rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground/70 dark:bg-white/10">
                  Ended
                </span>
              )}
              {state === "current" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-viatik-magenta px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm shadow-viatik-magenta/20">
                  {tripActive && (
                    <motion.span
                      className="size-1.5 rounded-full bg-white"
                      animate={LIVE_DOT_ANIMATION.animate}
                      transition={LIVE_DOT_ANIMATION.transition}
                    />
                  )}
                  Active
                </span>
              )}
              {state === "future" && startsIn && (
                <span className="inline-flex items-center gap-1 rounded-full border border-viatik-magenta/60 bg-viatik-magenta/5 px-2 py-0.5 text-[10px] font-semibold text-viatik-magenta">
                  <Clock3 className="size-3" aria-hidden />
                  Starts in {startsIn}
                </span>
              )}
            </div>

            <p
              className={cn(
                "truncate text-sm font-semibold",
                state === "current" && "font-bold text-foreground",
                state === "past" && "text-foreground/60",
                state === "future" && "text-foreground",
              )}
            >
              {title}
            </p>

            {location && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground/80">
                <MapPin className="size-3" aria-hidden /> {location}
              </p>
            )}

            {(checklist?.length ?? 0) > 0 && (
              <ActivityChecklistProgressPill checklist={checklist} className="mt-1" />
            )}
          </div>
        </div>
      </motion.div>
    </motion.li>
  );
}

function ActivityDetailModal({
  activity,
  onClose,
  onChecklistChange,
}: {
  activity: TimelineCardItem;
  timeZone?: string | null;
  onClose: () => void;
  onChecklistChange: (
    checklist: ActivityChecklistItem[],
    event?: { action: ChecklistFeedAction; itemTitle: string },
  ) => void;
}) {
  const checklist = activity.checklist ?? [];
  const description = activity.description?.trim() || null;
  const timeLabel = activity.formattedTime ?? "All day";
  const statusLabel =
    activity.state === "past"
      ? "Ended"
      : activity.state === "current"
        ? "Active"
        : activity.startsIn
          ? `Starts in ${activity.startsIn}`
          : null;

  return (
    <Dialog open onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-h-[90dvh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{activity.title}</DialogTitle>
          <DialogDescription>
            {activity.dayDate}
            {" · "}
            {timeLabel}
            {statusLabel ? ` · ${statusLabel}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {checklist.length > 0 ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {activity.state === "past" && (
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Ended
                  </span>
                )}
                {activity.state === "current" && (
                  <span className="rounded-full bg-viatik-magenta/15 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-viatik-magenta">
                    Active
                  </span>
                )}
                {activity.state === "future" && activity.startsIn && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                    <Clock3 className="size-3.5" aria-hidden />
                    Starts in {activity.startsIn}
                  </span>
                )}
                <ActivityChecklistProgressPill checklist={checklist} />
              </div>

              {activity.location && (
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="size-3.5 shrink-0" aria-hidden />
                  {activity.location}
                </p>
              )}

              {activity.startTime && activity.endTime && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock3 className="size-3.5 shrink-0" aria-hidden />
                  <span>
                    {formatWallClockTime(activity.startTime)}
                    {" – "}
                    {formatWallClockTime(activity.endTime)}
                  </span>
                </p>
              )}

              <div className="space-y-2 rounded-xl border border-border/60 p-3">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <ListChecks className="size-4 text-primary" aria-hidden />
                  Sub-tasks
                </p>
                <ActivityChecklistQuickActions checklist={checklist} onChange={onChecklistChange} />
              </div>
            </>
          ) : description ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
