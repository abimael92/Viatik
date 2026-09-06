/**
 * Live Transit & Logistics service layer.
 *
 * Pure, side-effect-free helpers for parsing provider payloads, applying a
 * status update onto a segment, and deriving a display state — plus
 * `fetchTransitStatus`, which couples a provider with an offline cache and a
 * graceful fallback so the UI never blocks on a flaky network.
 */

import {
  BOARDING_WINDOW_MINUTES,
  type TransitFetchResult,
  type TransitSegment,
  type TransitStatusCache,
  type TransitStatusProvider,
  type TransitStatusState,
  type TransitStatusUpdate,
} from "@/features/transit/domain/transit-types";

/** Normalize a provider's status string into our state vocabulary. */
export function normalizeStatusString(value: string | null | undefined): TransitStatusState {
  switch ((value ?? "").trim().toLowerCase()) {
    case "on-time":
    case "on_time":
    case "ontime":
    case "scheduled":
      return "scheduled";
    case "boarding":
      return "boarding";
    case "delayed":
    case "delay":
      return "delayed";
    case "cancelled":
    case "canceled":
    case "cancellation":
      return "cancelled";
    case "departed":
    case "departure":
      return "departed";
    case "landed":
    case "landing":
      return "landed";
    case "arrived":
    case "arrival":
      return "arrived";
    default:
      return "scheduled";
  }
}

function toIso(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Compute a delay in minutes from an estimated vs scheduled departure. */
export function computeDelayMinutes(
  scheduledDeparture: string,
  estimatedDeparture: string | null,
): number | null {
  if (!estimatedDeparture) return null;
  const scheduled = new Date(scheduledDeparture).getTime();
  const estimated = new Date(estimatedDeparture).getTime();
  if (Number.isNaN(scheduled) || Number.isNaN(estimated)) return null;
  const minutes = Math.round((estimated - scheduled) / 60000);
  return minutes > 0 ? minutes : null;
}

/**
 * Parse a raw provider payload into a normalized `TransitStatusUpdate`.
 * Handles both snake_case and camelCase fields and gracefully tolerates
 * missing/unknown values. Returns `null` when there is nothing usable.
 */
export function parseTransitStatusUpdate(
  raw: unknown,
  segment: Pick<TransitSegment, "scheduledDeparture">,
): TransitStatusUpdate | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;

  const estimatedDeparture = toIso(record.estimated_departure ?? record.estimatedDeparture);
  const estimatedArrival = toIso(record.estimated_arrival ?? record.estimatedArrival);
  const actualDeparture = toIso(record.actual_departure ?? record.actualDeparture);
  const actualArrival = toIso(record.actual_arrival ?? record.actualArrival);
  const delayMinutes = computeDelayMinutes(segment.scheduledDeparture, estimatedDeparture);

  const status = normalizeStatusString(record.status as string | null | undefined);
  const statusMessage =
    typeof record.status_message === "string" && record.status_message.trim()
      ? record.status_message.trim()
      : typeof record.message === "string" && record.message.trim()
        ? record.message.trim()
        : null;

  return {
    status,
    statusMessage,
    estimatedDeparture,
    estimatedArrival,
    actualDeparture,
    actualArrival,
    delayMinutes,
  };
}

/** Apply a normalized status update onto a segment, returning a new segment. */
export function applyTransitStatusUpdate(
  segment: TransitSegment,
  update: TransitStatusUpdate,
): TransitSegment {
  return {
    ...segment,
    status: update.status,
    statusMessage: update.statusMessage ?? segment.statusMessage,
    estimatedDeparture: update.estimatedDeparture ?? segment.estimatedDeparture,
    estimatedArrival: update.estimatedArrival ?? segment.estimatedArrival,
    actualDeparture: update.actualDeparture ?? segment.actualDeparture,
    actualArrival: update.actualArrival ?? segment.actualArrival,
    delayMinutes: update.delayMinutes ?? segment.delayMinutes,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Derive the effective display state from a segment at a given time. Pure, so
 * the UI can render a live banner without mutating stored data:
 *  - terminal states are authoritative;
 *  - a "scheduled" leg with delay data is promoted to "delayed";
 *  - a flight inside its boarding window is promoted to "boarding".
 */
export function deriveStatusState(
  segment: TransitSegment,
  now: Date = new Date(),
): TransitStatusState {
  if (segment.status === "cancelled") return "cancelled";
  if (
    segment.status === "departed" ||
    segment.status === "landed" ||
    segment.status === "arrived" ||
    segment.status === "boarding" ||
    segment.status === "delayed"
  ) {
    return segment.status;
  }

  if (segment.delayMinutes != null && segment.delayMinutes > 0) return "delayed";

  if (segment.mode === "flight" && segment.status === "scheduled") {
    const departure = new Date(segment.scheduledDeparture).getTime();
    const boardingStarts = departure - BOARDING_WINDOW_MINUTES * 60000;
    if (
      !Number.isNaN(departure) &&
      now.getTime() >= boardingStarts &&
      now.getTime() < departure
    ) {
      return "boarding";
    }
  }

  return "scheduled";
}

/**
 * Fetch a segment's live status with offline caching and fallback.
 *
 * Order:
 *   1. live provider (skipped when offline or no provider);
 *   2. cached last-known status;
 *   3. fallback — the segment as-is (e.g. "scheduled").
 *
 * The caller persists `result.segment` (its status fields) to keep the cache
 * warm for offline reads.
 */
export async function fetchTransitStatus(
  segment: TransitSegment,
  deps: {
    provider?: TransitStatusProvider | null;
    cache?: TransitStatusCache | null;
    offline?: boolean;
    now?: Date;
  } = {},
): Promise<TransitFetchResult> {
  const { provider, cache, offline = false } = deps;

  if (!offline && provider) {
    try {
      const update = await provider.fetchStatus(segment);
      if (update) {
        const updated = applyTransitStatusUpdate(segment, update);
        await cache?.save(segment.id, update);
        return { segment: updated, source: "live" };
      }
    } catch {
      // Provider failure → fall through to cache/fallback.
    }
  }

  const cached = await cache?.getCached(segment.id);
  if (cached) {
    return { segment: applyTransitStatusUpdate(segment, cached), source: "cache" };
  }

  return { segment, source: "fallback" };
}
