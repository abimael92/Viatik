"use client";

import { ChevronLeft, ChevronRight, CloudRain, Pencil, Plane, TrainFront, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AddTransitDialog } from "@/features/transit/components/add-transit-dialog";
import { transitRepository } from "@/features/transit/data/dexie-transit-repository";
import type { Activity } from "@/features/domain/entities";
import type { DailyForecast, WeatherWarning } from "@/features/weather/domain/weather-types";
import type { WeatherConflict } from "@/features/weather/domain/weather-conflict-types";
import { WeatherDayBadge } from "@/features/weather/components/weather-day-badge";
import { useTransitSegments } from "@/features/transit/components/use-transit";
import { TRANSIT_STATUS_META, type TransitSegment } from "@/features/transit/domain/transit-types";
import { deriveStatusState } from "@/features/transit/lib/transit-service";
import { cn } from "@/lib/utils";

const START_HOUR = 0;
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
  canEdit = false,
  onCreateActivity,
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
  canEdit?: boolean;
  onCreateActivity?: (dayDate: string, time: string) => void;
}) {
  const [view, setView] = useState<"today" | "range" | "all">("all");
  const [rangeStart, setRangeStart] = useState(() => {
    const idx = days.indexOf(localDateKey(new Date()));
    const weekStart = idx >= 0 ? Math.floor(idx / 7) * 7 : 0;
    return days[weekStart] ?? "";
  });
  const [rangeEnd, setRangeEnd] = useState(() => {
    const idx = days.indexOf(localDateKey(new Date()));
    const weekStart = idx >= 0 ? Math.floor(idx / 7) * 7 : 0;
    return days[Math.min(weekStart + 6, days.length - 1)] ?? "";
  });
  const [now, setNow] = useState(() => new Date());
  const [selectedTransit, setSelectedTransit] = useState<TransitSegment | null>(null);
  const [editingTransit, setEditingTransit] = useState<TransitSegment | null>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const todayKey = localDateKey(now);
  const visibleDays = days.length === 0 ? [] : view === "all" ? days : view === "today" ? [days.find((day) => day >= todayKey) ?? days.at(-1)!] : days.filter((day) => day >= rangeStart && day <= rangeEnd);
  const byDay = new Map(visibleDays.map((day) => [day, activities.filter((activity) => activity.dayDate === day && activity.deletedAt === null)]));
  const { segments } = useTransitSegments(tripId);
  const transitByDay = useMemo(() => {
    const map = new Map<string, TransitSegment[]>();
    for (const segment of segments) {
      if (segment.deletedAt) continue;
      const list = map.get(segment.dayDate) ?? [];
      list.push(segment);
      map.set(segment.dayDate, list);
    }
    return map;
  }, [segments]);
  const title = visibleDays.length === 1 ? formatHeader(visibleDays[0]) : visibleDays.length ? `${formatHeader(visibleDays[0])} – ${formatHeader(visibleDays.at(-1)!)}` : "Trip calendar";
  const shiftRange = (direction: -1 | 1) => {
    const len = Math.max(1, visibleDays.length);
    const idx = rangeStart ? days.indexOf(rangeStart) : -1;
    if (idx < 0 || days.length === 0) return;
    const next = Math.min(Math.max(0, idx + direction * len), days.length - 1);
    setRangeStart(days[next]);
    setRangeEnd(days[Math.min(next + len - 1, days.length - 1)]);
  };

  return (
    <>
    <section className="overflow-hidden rounded-2xl border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b p-3 sm:p-4"><div><h3 className="font-semibold">{title}</h3><p className="text-xs text-muted-foreground">Click an open time to add an activity.</p></div><div className="flex flex-wrap items-center gap-2"><div className="flex rounded-md border p-0.5"><Button type="button" size="sm" variant={view === "today" ? "default" : "ghost"} onClick={() => setView("today")}>Today</Button><Button type="button" size="sm" variant={view === "range" ? "default" : "ghost"} onClick={() => setView("range")}>Range</Button><Button type="button" size="sm" variant={view === "all" ? "default" : "ghost"} onClick={() => setView("all")}>All</Button></div>{view === "range" && (<div className="flex flex-wrap items-center gap-1"><div className="flex items-center gap-1"><Button type="button" size="icon" variant="ghost" aria-label="Shift range earlier" disabled={!rangeStart || rangeStart === days[0]} onClick={() => shiftRange(-1)}><ChevronLeft /></Button><input type="date" value={rangeStart} min={days[0]} max={rangeEnd} onChange={(event) => setRangeStart(event.target.value)} className="h-8 rounded-md border bg-background px-2 text-sm" aria-label="Range start date" /><span className="text-xs text-muted-foreground">to</span><input type="date" value={rangeEnd} min={rangeStart} max={days.at(-1)} onChange={(event) => setRangeEnd(event.target.value)} className="h-8 rounded-md border bg-background px-2 text-sm" aria-label="Range end date" /><Button type="button" size="icon" variant="ghost" aria-label="Shift range later" disabled={!rangeEnd || rangeEnd === days.at(-1)} onClick={() => shiftRange(1)}><ChevronRight /></Button></div></div>)}</div></header>
      <div className="overflow-x-auto">
        <div className="min-w-[860px]">
          <div className="grid" style={{ gridTemplateColumns: `5rem repeat(${visibleDays.length}, minmax(7rem, 1fr))` }}>
            <div className="sticky top-0 z-30 border-b border-r bg-card p-3 text-xs text-muted-foreground">Local time</div>
            {visibleDays.map((day) => (
              <div key={day} className="sticky top-0 z-30 border-b border-r bg-card p-3 text-center last:border-r-0">
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
          </div>
          <div className="grid max-h-[65vh] overflow-y-auto" style={{ gridTemplateColumns: `5rem repeat(${visibleDays.length}, minmax(7rem, 1fr))` }}>
            <div className="relative border-r" style={{ height: (END_HOUR - START_HOUR) * HOUR_HEIGHT }}>{Array.from({ length: END_HOUR - START_HOUR }, (_, index) => <div key={index} className="absolute w-full border-t pr-2 pt-1 text-right text-xs text-muted-foreground" style={{ top: index * HOUR_HEIGHT }}>{formatHour(START_HOUR + index)}</div>)}</div>
            {visibleDays.map((day) => {
              const daySegments = transitByDay.get(day) ?? [];
              const dayActivities = byDay.get(day) ?? [];
              const today = localDateKey(now) === day;
              const nowMinute = now.getHours() * 60 + now.getMinutes();
              return (
                <div key={day} className={cn("relative border-r last:border-r-0", canEdit && "cursor-crosshair")} style={{ height: (END_HOUR - START_HOUR) * HOUR_HEIGHT, backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_HEIGHT - 1}px, var(--color-border) ${HOUR_HEIGHT}px)` }} onClick={(event) => { if (!canEdit || !onCreateActivity || (event.target as HTMLElement).closest("button")) return; const rect = event.currentTarget.getBoundingClientRect(); const minutes = START_HOUR * 60 + Math.round(((event.clientY - rect.top) / HOUR_HEIGHT) * 4) * 15; onCreateActivity(day, minuteToTime(Math.min(minutes, END_HOUR * 60 - 15))); }}>
                  {daySegments.map((segment) => {
                    const range = transitRange(segment);
                    const overlaps = dayActivities.some((activity) => rangesOverlap(range, activityRange(activity)));
                    return <TransitBlock key={segment.id} segment={segment} split={overlaps} onClick={() => setSelectedTransit(segment)} />;
                  })}
                  {dayActivities.map((activity) => { const range = activityRange(activity); const top = Math.max(0, (range.start - START_HOUR * 60) / 60 * HOUR_HEIGHT); const height = Math.max(28, (range.end - range.start) / 60 * HOUR_HEIGHT); const overlaps = daySegments.some((segment) => rangesOverlap(range, transitRange(segment))); const conflict = conflicts?.[activity.id]; return <button key={activity.id} type="button" onClick={() => onSelect?.(activity)} className={`absolute ${overlaps ? "left-[51%]" : "left-1"} right-1 z-10 overflow-hidden rounded-md border-l-4 border-primary bg-primary/15 px-2 py-1 text-left text-xs hover:bg-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`} style={{ top, height }} aria-label={`Open details for ${activity.title}${conflict ? ` (weather warning)` : ""}`} data-activity-id={activity.id}><strong className="block truncate">{activity.title}</strong><span className="text-muted-foreground">{activity.startTime ? new Date(activity.startTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "Time not set"}</span>{conflict && <span className="mt-0.5 inline-flex items-center gap-1 text-destructive" role="img" aria-label={conflict.reason} title={conflict.reason}><CloudRain className="size-3" />Weather</span>}</button>; })}
                  {today && nowMinute >= START_HOUR * 60 && nowMinute <= END_HOUR * 60 && <CurrentTimeLine minute={nowMinute} />}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
    <TransitDetailsDialog
      segment={selectedTransit}
      canEdit={canEdit}
      onClose={() => setSelectedTransit(null)}
      onEdit={(segment) => { setSelectedTransit(null); setEditingTransit(segment); }}
      onDelete={async (segment) => { await transitRepository.remove(segment.id); setSelectedTransit(null); }}
    />
    <AddTransitDialog
      key={editingTransit?.id ?? "no-transit-edit"}
      open={editingTransit !== null}
      onOpenChange={(open) => { if (!open) setEditingTransit(null); }}
      tripId={tripId}
      userId={editingTransit?.createdBy ?? ""}
      defaultDay={editingTransit?.dayDate ?? visibleDays[0] ?? localDateKey(now)}
      segment={editingTransit ?? undefined}
    />
    </>
  );
}

function TransitBlock({ segment, split, onClick }: { segment: TransitSegment; split: boolean; onClick: () => void }) {
  const state = deriveStatusState(segment);
  const meta = TRANSIT_STATUS_META[state];
  const Icon = segment.mode === "flight" ? Plane : TrainFront;
  const label = [segment.carrierCode, segment.number].filter(Boolean).join(" ") || segment.carrier;
  const delayed = state === "delayed" || state === "boarding";

  // Position and size the block from its scheduled departure → arrival, like a
  // calendar meeting. Default to a one-hour block when no arrival is set, and
  // roll an overnight arrival forward a day so the duration is positive.
  const depMin = timeMinute(segment.scheduledDeparture, START_HOUR * 60);
  let arrMin = segment.scheduledArrival ? timeMinute(segment.scheduledArrival, depMin + 60) : depMin + 60;
  if (arrMin <= depMin) arrMin += 1440;
  const top = Math.max(0, (depMin - START_HOUR * 60) / 60 * HOUR_HEIGHT);
  const height = Math.max(28, (arrMin - depMin) / 60 * HOUR_HEIGHT);

  const depLabel = segment.scheduledDeparture ? new Date(segment.scheduledDeparture).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—";
  const arrLabel = segment.scheduledArrival ? new Date(segment.scheduledArrival).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null;
  const route = [segment.origin, segment.destination].filter(Boolean).join(" → ") || label;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "absolute left-1 z-10 overflow-hidden rounded-md border-l-4 p-2 text-left text-xs shadow-sm transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        split ? "right-[51%]" : "right-1",
        state === "cancelled"
          ? "border-destructive bg-destructive/10 text-destructive"
          : delayed
            ? "border-amber-500 bg-amber-500/10 text-amber-700"
            : "border-accent bg-accent/15"
      )}
      style={{ top, height }}
      aria-label={`Open ${label} details, ${meta.label}`}
      title={`${label} · ${meta.label} · ${route}`}
    >
      <span className="flex items-center gap-1 font-semibold">
        <Icon className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">{label}</span>
      </span>
      <span className="block truncate text-muted-foreground">{depLabel}{arrLabel ? ` – ${arrLabel}` : ""}</span>
      {route !== label && <span className="block truncate text-muted-foreground">{route}</span>}
    </button>
  );
}

function TicketImage({ image, name }: { image: Blob; name: string }) {
  const url = useMemo(() => URL.createObjectURL(image), [image]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  if (!url) return null;
  return (
    <div className="mb-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={name} className="max-h-56 w-full rounded-lg border object-contain" />
    </div>
  );
}

function CurrentTimeLine({ minute }: { minute: number }) {
  const top = (minute - START_HOUR * 60) / 60 * HOUR_HEIGHT;
  return <div className="pointer-events-none absolute left-0 right-0 z-30 border-t-2 border-red-500" style={{ top }} aria-hidden><span className="absolute -left-1.5 -top-1.5 size-3 rounded-full bg-red-500" /></div>;
}

function TransitDetailsDialog({ segment, canEdit, onClose, onEdit, onDelete }: { segment: TransitSegment | null; canEdit: boolean; onClose: () => void; onEdit: (segment: TransitSegment) => void; onDelete: (segment: TransitSegment) => Promise<void> }) {
  if (!segment) return null;
  const Icon = segment.mode === "flight" ? Plane : TrainFront;
  const label = [segment.carrierCode, segment.number].filter(Boolean).join(" ") || segment.carrier;
  const departure = new Date(segment.scheduledDeparture);
  const arrival = segment.scheduledArrival ? new Date(segment.scheduledArrival) : null;
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Icon className="size-5" />{label}</DialogTitle>
          <DialogDescription>{segment.carrier} · {TRANSIT_STATUS_META[deriveStatusState(segment)].label}</DialogDescription>
        </DialogHeader>
        {segment.ticketImage && <TicketImage image={segment.ticketImage} name={segment.ticketImageName ?? "Ticket"} />}
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
          <dt className="text-muted-foreground">Route</dt><dd className="font-medium">{segment.origin ?? "—"} → {segment.destination ?? "—"}</dd>
          <dt className="text-muted-foreground">Departure</dt><dd>{departure.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</dd>
          <dt className="text-muted-foreground">Arrival</dt><dd>{arrival ? arrival.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Not set"}</dd>
          <dt className="text-muted-foreground">{segment.mode === "flight" ? "Gate" : "Platform"}</dt><dd>{segment.mode === "flight" ? segment.gate ?? "—" : segment.platform ?? "—"}</dd>
          {segment.statusMessage && <><dt className="text-muted-foreground">Status</dt><dd>{segment.statusMessage}</dd></>}
        </dl>
        <DialogFooter>
          {canEdit && <Button type="button" variant="destructive" onClick={() => { if (window.confirm(`Delete ${label}?`)) void onDelete(segment); }}><Trash2 className="size-4" />Delete</Button>}
          {canEdit && <Button type="button" variant="outline" onClick={() => onEdit(segment)}><Pencil className="size-4" />Edit</Button>}
          <Button type="button" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function transitRange(segment: TransitSegment) {
  const start = timeMinute(segment.scheduledDeparture, START_HOUR * 60);
  let end = segment.scheduledArrival ? timeMinute(segment.scheduledArrival, start + 60) : start + 60;
  if (end <= start) end += 1440;
  return { start, end };
}
function activityRange(activity: Activity) { const start = timeMinute(activity.startTime, START_HOUR * 60); return { start, end: Math.max(start + 30, timeMinute(activity.endTime, start + 60)) }; }
function rangesOverlap(a: { start: number; end: number }, b: { start: number; end: number }) { return a.start < b.end && b.start < a.end; }
function localDateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function minuteToTime(minute: number) { return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`; }

function timeMinute(value: string | null, fallback: number) { if (!value) return fallback; const date = new Date(value); return date.getHours() * 60 + date.getMinutes(); }
function formatHour(hour: number) { return new Date(2000, 0, 1, hour).toLocaleTimeString([], { hour: "numeric" }); }
function formatHeader(day: string) { return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
