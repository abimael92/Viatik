"use client";

import {
  AlertTriangle,
  ArrowRight,
  Clock,
  MapPin,
  Plane,
  RefreshCw,
  TrainFront,
} from "lucide-react";
import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import {
  TRANSIT_STATUS_META,
  type TransitSegment,
  type TransitStatusState,
} from "@/features/transit/domain/transit-types";
import { deriveStatusState } from "@/features/transit/lib/transit-service";
import { cn } from "@/lib/utils";

const BANNER_TONE: Record<TransitStatusState, string> = {
  scheduled: "border-border bg-card",
  boarding: "border-primary/40 bg-primary/10",
  delayed: "border-accent/50 bg-accent/10",
  cancelled: "border-destructive/40 bg-destructive/10",
  departed: "border-success/40 bg-success/10",
  landed: "border-success/40 bg-success/10",
  arrived: "border-success/40 bg-success/10",
};

interface TransitCardProps {
  segment: TransitSegment;
  /** Tap to open the leg (e.g. edit). */
  onSelect?: (segment: TransitSegment) => void;
  /** Refresh live status for this leg. */
  onRefresh?: (segment: TransitSegment) => void;
  /** Show the refresh control (hidden in read-only/guest contexts). */
  interactive?: boolean;
}

/**
 * Dynamic status banner card for a flight/train leg. Color-coded by the derived
 * status state, with a delay warning, gate/terminal/boarding-pass details, and
 * an optional live-status refresh control.
 */
export function TransitCard({ segment, onSelect, onRefresh, interactive = true }: TransitCardProps) {
  const state = useMemo(() => deriveStatusState(segment), [segment]);
  const meta = TRANSIT_STATUS_META[state];
  const delayed = state === "delayed" || (segment.delayMinutes != null && segment.delayMinutes > 0);
  const cancelled = state === "cancelled";

  const identifier = [segment.carrierCode, segment.number].filter(Boolean).join(" ");
  const modeLabel = transitModeLabel(segment.mode);
  const departureTime = segment.estimatedDeparture ?? segment.scheduledDeparture;
  const arrivalTime = segment.estimatedArrival ?? segment.scheduledArrival;
  const duration = arrivalTimeDuration(departureTime, arrivalTime);
  const departureLabel = segment.estimatedDeparture ? "Est. departure" : "Scheduled";
  const arrivalLabel = segment.estimatedArrival ? "Est. arrival" : "Scheduled arrival";
  const station = segment.gate ?? segment.platform ?? segment.terminal;

  return (
    <article
      className={cn(
        "rounded-lg border p-3 shadow-sm transition-shadow",
        BANNER_TONE[state],
        onSelect && "cursor-pointer hover:shadow-md"
      )}
      data-transit-id={segment.id}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-card text-muted-foreground">
            {segment.mode === "flight" ? (
              <Plane className="size-5" aria-hidden />
            ) : (
              <TrainFront className="size-5" aria-hidden />
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{modeLabel}{segment.carrier ? ` · ${segment.carrier}` : ""}{identifier ? ` · ${identifier}` : ""}</p>
            <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
              {segment.origin ?? "—"} <ArrowRight className="size-3 shrink-0" aria-hidden /> {segment.destination ?? "—"}
            </p>
          </div>
        </div>
        <Badge variant={meta.tone}>{meta.label}</Badge>
      </header>

      {(delayed || cancelled) && (
        <p
          role="alert"
          className={cn(
            "mt-2 flex items-start gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold",
            cancelled
              ? "bg-destructive/15 text-destructive"
              : "bg-accent/20 text-accent-foreground"
          )}
        >
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {cancelled
            ? "This leg has been cancelled."
            : `Delayed by ${segment.delayMinutes} min`}
        </p>
      )}

      {segment.statusMessage && (
        <p className="mt-2 text-xs text-muted-foreground">{segment.statusMessage}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="size-3.5" aria-hidden />
          <span>
            {departureLabel}: <span className="font-semibold text-foreground">{formatTime(departureTime)}</span>
          </span>
        </span>
        {arrivalTime && (
          <span className="flex items-center gap-1">
            <Clock className="size-3.5" aria-hidden />
            <span>
              {arrivalLabel}: <span className="font-semibold text-foreground">{formatTime(arrivalTime)}</span>
            </span>
          </span>
        )}
        {duration !== null && <span className="font-semibold text-foreground">{formatDuration(duration)} travel</span>}
        {station && (
          <span className="flex items-center gap-1 font-semibold text-foreground">
            <MapPin className="size-3.5" aria-hidden />
            {segment.gate ? `Gate ${station}` : segment.platform ? `Platform ${station}` : `Terminal ${station}`}
          </span>
        )}
      </div>

      {interactive && onRefresh && (
        <button
          type="button"
          onClick={() => onRefresh(segment)}
          className="mt-2 flex items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Refresh status for ${identifier || segment.carrier}`}
        >
          <RefreshCw className="size-3.5" aria-hidden /> Refresh status
        </button>
      )}
    </article>
  );
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function transitModeLabel(mode: TransitSegment["mode"]): string {
  return {
    flight: "Plane",
    train: "Train",
    car: "Car",
    carpool: "Carpool",
    taxi: "Taxi",
    rideshare: "Uber / rideshare",
    bus: "Bus",
    ship: "Ship",
    ferry: "Ferry",
    bike: "Bike",
    walk: "Walk",
  }[mode];
}

function arrivalTimeDuration(departure: string, arrival: string | null): number | null {
  if (!arrival) return null;
  const duration = Math.round((new Date(arrival).getTime() - new Date(departure).getTime()) / 60000);
  if (!Number.isFinite(duration)) return null;
  return duration > 0 ? duration : duration + 24 * 60;
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return [hours ? `${hours}h` : "", remainder ? `${remainder}m` : ""].filter(Boolean).join(" ");
}
