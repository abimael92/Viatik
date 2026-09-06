"use client";

import { ChevronLeft, ChevronRight, CloudRain, Plane, TrainFront } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import type { Activity } from "@/features/domain/entities";
import type { DailyForecast, WeatherWarning } from "@/features/weather/domain/weather-types";
import type { WeatherConflict } from "@/features/weather/domain/weather-conflict-types";
import { WeatherDayBadge } from "@/features/weather/components/weather-day-badge";
import { useTransitSegments } from "@/features/transit/components/use-transit";
import { TRANSIT_STATUS_META, type TransitSegment } from "@/features/transit/domain/transit-types";
import { deriveStatusState } from "@/features/transit/lib/transit-service";
import { cn } from "@/lib/utils";

const START_HOUR = 6;
const END_HOUR = 24;
const HOUR_HEIGHT = 64;

export function WeekCalendar({
  tripId,
  days,
  activities,
  onSelect,
  forecast,
  warnings,
  weatherLoading,
  conflicts,
}: {
  tripId: string;
  days: string[];
  activities: Activity[];
  onSelect?: (activity: Activity) => void;
  forecast?: DailyForecast;
  warnings?: WeatherWarning[];
  weatherLoading?: boolean;
  /** Weather conflict per activity id, to badge impacted cards. */
  conflicts?: Record<string, WeatherConflict>;
}) {
  const [start, setStart] = useState(0);
  const visibleDays = days.slice(start, start + 7);
  const byDay = new Map(visibleDays.map((day) => [day, activities.filter((activity) => activity.dayDate === day && activity.deletedAt === null)]));
  const { segments } = useTransitSegments(tripId);
  const transitByDay = useMemo(() => {
    const map = new Map<string, TransitSegment[]>();
    for (const segment of segments) {
      const list = map.get(segment.dayDate) ?? [];
      list.push(segment);
      map.set(segment.dayDate, list);
    }
    return map;
  }, [segments]);
  const title = visibleDays.length ? `${formatHeader(visibleDays[0])} – ${formatHeader(visibleDays.at(-1)!)}` : "Trip calendar";

  return (
    <section className="overflow-hidden rounded-2xl border bg-card">
      <header className="flex items-center justify-between gap-3 border-b p-3 sm:p-4"><div><h3 className="font-semibold">{title}</h3><p className="text-xs text-muted-foreground">Open time is available for planning.</p></div><div className="flex gap-1"><Button type="button" size="icon" variant="ghost" aria-label="Previous week" disabled={start === 0} onClick={() => setStart(Math.max(0, start - 7))}><ChevronLeft /></Button><Button type="button" size="icon" variant="ghost" aria-label="Next week" disabled={start + 7 >= days.length} onClick={() => setStart(start + 7)}><ChevronRight /></Button></div></header>
      <div className="overflow-x-auto">
        <div className="grid min-w-[860px]" style={{ gridTemplateColumns: `5rem repeat(${visibleDays.length}, minmax(7rem, 1fr))` }}>
          <div className="border-b border-r p-3 text-xs text-muted-foreground">Local time</div>
          {visibleDays.map((day) => (
            <div key={day} className="border-b border-r p-3 text-center last:border-r-0">
              <p className="text-xs uppercase text-muted-foreground">
                {new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" })}
              </p>
              <p className="mt-1 font-semibold">
                {new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </p>
              <div className="mt-1 flex justify-center">
                <WeatherDayBadge
                  dayDate={day}
                  forecast={forecast}
                  warnings={warnings}
                  loading={weatherLoading}
                />
              </div>
            </div>
          ))}
          <div className="relative border-r" style={{ height: (END_HOUR - START_HOUR) * HOUR_HEIGHT }}>{Array.from({ length: END_HOUR - START_HOUR }, (_, index) => <div key={index} className="absolute w-full border-t pr-2 pt-1 text-right text-xs text-muted-foreground" style={{ top: index * HOUR_HEIGHT }}>{formatHour(START_HOUR + index)}</div>)}</div>
          {visibleDays.map((day) => <div key={day} className="relative border-r last:border-r-0" style={{ height: (END_HOUR - START_HOUR) * HOUR_HEIGHT, backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_HEIGHT - 1}px, var(--color-border) ${HOUR_HEIGHT}px)` }}>{(transitByDay.get(day) ?? []).map((segment) => { const startMinute = timeMinute(segment.scheduledDeparture, START_HOUR * 60); const top = Math.max(0, (startMinute - START_HOUR * 60) / 60 * HOUR_HEIGHT); return <TransitBlock key={segment.id} segment={segment} top={top} />; })}{(byDay.get(day) ?? []).map((activity) => { const startMinute = timeMinute(activity.startTime, START_HOUR * 60); const endMinute = Math.max(startMinute + 30, timeMinute(activity.endTime, startMinute + 60)); const top = Math.max(0, (startMinute - START_HOUR * 60) / 60 * HOUR_HEIGHT); const height = Math.max(28, (endMinute - startMinute) / 60 * HOUR_HEIGHT); const conflict = conflicts?.[activity.id]; return <button key={activity.id} type="button" onClick={() => onSelect?.(activity)} className="absolute left-1 right-1 overflow-hidden rounded-md border-l-4 border-primary bg-primary/15 px-2 py-1 text-left text-xs hover:bg-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ top, height }} aria-label={`Open details for ${activity.title}${conflict ? ` (weather warning)` : ""}`} data-activity-id={activity.id}><strong className="block truncate">{activity.title}</strong><span className="text-muted-foreground">{activity.startTime ? new Date(activity.startTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "Time not set"}</span>{conflict && <span className="mt-0.5 inline-flex items-center gap-1 text-destructive" role="img" aria-label={conflict.reason} title={conflict.reason}><CloudRain className="size-3" />Weather</span>}</button>; })}</div>)}
        </div>
      </div>
    </section>
  );
}

function TransitBlock({ segment, top }: { segment: TransitSegment; top: number }) {
  const state = deriveStatusState(segment);
  const meta = TRANSIT_STATUS_META[state];
  const Icon = segment.mode === "flight" ? Plane : TrainFront;
  const label = [segment.carrierCode, segment.number].filter(Boolean).join(" ") || segment.carrier;
  const delayed = state === "delayed" || state === "boarding";
  return (
    <div
      className={cn(
        "absolute left-1 right-1 z-10 overflow-hidden rounded-md border-l-4 border px-2 py-1 text-left text-xs",
        state === "cancelled"
          ? "border-destructive bg-destructive/10 text-destructive"
          : delayed
            ? "border-accent bg-accent/15"
            : "border-muted-foreground/40 bg-card/90"
      )}
      style={{ top, height: 34 }}
      role="status"
      aria-label={`${label} ${meta.label}`}
      title={`${label} · ${meta.label}`}
    >
      <span className="flex items-center gap-1 font-semibold">
        <Icon className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">{label}</span>
        <span className="ml-auto shrink-0 text-muted-foreground">
          {new Date(segment.scheduledDeparture).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
        </span>
      </span>
      {(segment.origin || segment.destination) && (
        <span className="block truncate text-muted-foreground">
          {segment.origin ?? "—"} → {segment.destination ?? "—"}
        </span>
      )}
    </div>
  );
}

function timeMinute(value: string | null, fallback: number) { if (!value) return fallback; const date = new Date(value); return date.getHours() * 60 + date.getMinutes(); }
function formatHour(hour: number) { return new Date(2000, 0, 1, hour).toLocaleTimeString([], { hour: "numeric" }); }
function formatHeader(day: string) { return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
