"use client";

import { Plane } from "lucide-react";

import { deriveRouteFacts } from "@/features/trip-planner/domain/scout-flight-route";
import type { ScoutFlightRoute } from "@/features/trip-planner/domain/scout-trip-ideas-schema";
import { useI18n } from "@/lib/i18n/i18n-provider";

function formatMinutes(minutes: number): { hours: number; minutes: number } {
  return { hours: Math.floor(minutes / 60), minutes: minutes % 60 };
}

export function useRouteTimeLabel(): (minutes: number) => string {
  const { t } = useI18n();
  return (minutes: number) => {
    const { hours, minutes: rest } = formatMinutes(minutes);
    return hours > 0
      ? t("copy.scoutRouteDuration", { hours, minutes: rest })
      : t("copy.scoutRouteDurationMinutes", { minutes: rest });
  };
}

/** City chain like `A → B → C` built from the route legs. */
export function routeChain(route: ScoutFlightRoute): string {
  const cities = route.legs.map((leg) => leg.from);
  const last = route.legs[route.legs.length - 1];
  if (last) cities.push(last.to);
  return cities.join(" → ");
}

/**
 * One glanceable route line per Scout result: the city chain, the stop count,
 * the estimated elapsed time, and whether it lands the same calendar date.
 */
export function FlightRouteSummary({ route }: { route: ScoutFlightRoute }) {
  const { t } = useI18n();
  const facts = deriveRouteFacts(route);
  const timeLabel = useRouteTimeLabel();
  const stopsLabel =
    facts.stops === 0
      ? t("copy.scoutRouteNonstop")
      : facts.stops === 1
        ? t("copy.scoutRouteOneStop")
        : t("copy.scoutRouteStops", { count: facts.stops });

  return (
    <div className="mt-1.5 space-y-1 text-xs text-muted-foreground">
      <p className="flex items-center gap-1.5">
        <Plane aria-hidden className="size-3.5 shrink-0" />
        <span className="min-w-0 font-medium text-foreground/90">{routeChain(route)}</span>
      </p>
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <span>{stopsLabel}</span>
        <span aria-hidden>·</span>
        <span className="tabular-nums">{timeLabel(facts.elapsedMinutes)}</span>
        <span aria-hidden>·</span>
        <span
          className={
            facts.arrivesSameDate ? "font-medium text-success" : "font-medium text-muted-foreground"
          }
        >
          {facts.arrivesSameDate ? t("copy.scoutRouteSameDay") : t("copy.scoutRouteNextDay")}
        </span>
      </p>
    </div>
  );
}

/** Leg-by-leg breakdown for the flight details submodal. */
export function FlightRouteLegs({ route }: { route: ScoutFlightRoute }) {
  const { t } = useI18n();
  const timeLabel = useRouteTimeLabel();

  return (
    <ol className="space-y-2">
      {route.legs.map((leg, index) => (
        <li
          key={`${leg.from}-${leg.to}-${index}`}
          className="rounded-xl border border-border/60 bg-muted/30 p-3"
        >
          <p className="flex items-center justify-between gap-2 text-sm font-medium">
            <span className="truncate">
              {leg.from} → {leg.to}
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {timeLabel(leg.approx_duration_minutes)}
            </span>
          </p>
          {leg.layover_after_minutes > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              {t("copy.scoutRouteLayover", {
                city: leg.to,
                duration: timeLabel(leg.layover_after_minutes),
              })}
            </p>
          )}
        </li>
      ))}
      <li className="list-none text-xs text-muted-foreground">
        {t("copy.scoutRouteEstimateNote")}
      </li>
    </ol>
  );
}
