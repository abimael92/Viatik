import type { ScoutFlightRoute } from "@/features/trip-planner/domain/scout-trip-ideas-schema";
import type { TripIdeaFlightRoute } from "@/features/trip-planner/domain/trip-planner-types";

/** Minutes in a day; a route this long can never land the same calendar date. */
const MINUTES_PER_DAY = 1440;

export type RouteFacts = {
  /** Connections between legs: `legs - 1`. */
  stops: number;
  /** Sum of airborne minutes plus every layover. */
  elapsedMinutes: number;
  /**
   * The model's `arrives_same_date` flag gated by the elapsed estimate: a
   * journey of 24 hours or more can never promise a same-date arrival.
   */
  arrivesSameDate: boolean;
};

export function deriveRouteFacts(route: ScoutFlightRoute): RouteFacts {
  const elapsedMinutes = route.legs.reduce(
    (total, leg) => total + leg.approx_duration_minutes + leg.layover_after_minutes,
    0
  );
  return {
    stops: route.legs.length - 1,
    elapsedMinutes,
    arrivesSameDate: route.arrives_same_date && elapsedMinutes < MINUTES_PER_DAY,
  };
}

/**
 * Repair a broken provider join by copying each previous leg's `to` into the
 * next leg's `from`. Returns the legs unchanged when already contiguous.
 */
export function repairRouteContiguity<T extends { from: string; to: string }>(legs: T[]): T[] {
  return legs.map((leg, index) => (index === 0 ? leg : { ...leg, from: legs[index - 1]!.to }));
}

/** Lower-cased city chain (`"A > B > C"`) used for route dedupe and exclusions. */
export function routeSignature(route: ScoutFlightRoute): string {
  const chain = route.legs.map((leg) => leg.from);
  const last = route.legs[route.legs.length - 1];
  if (last) chain.push(last.to);
  return chain.map((city) => city.trim().toLowerCase()).join(" > ");
}

/** Map the provider's snake_case route to the persisted estimate shape. */
export function toTripIdeaFlightRoute(route: ScoutFlightRoute): TripIdeaFlightRoute {
  const facts = deriveRouteFacts(route);
  return {
    legs: route.legs.map((leg) => ({
      from: leg.from.trim(),
      to: leg.to.trim(),
      approxDurationMinutes: leg.approx_duration_minutes,
      layoverAfterMinutes: leg.layover_after_minutes,
    })),
    arrivesSameDate: facts.arrivesSameDate,
    isEstimate: true,
  };
}
