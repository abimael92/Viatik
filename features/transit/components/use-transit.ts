"use client";

import { useCallback, useEffect, useState } from "react";

import { transitRepository } from "@/features/transit/data/dexie-transit-repository";
import type {
  TransitFetchResult,
  TransitSegment,
  TransitStatusCache,
  TransitStatusProvider,
  TransitStatusUpdate,
} from "@/features/transit/domain/transit-types";
import { fetchTransitStatus } from "@/features/transit/lib/transit-service";

function toStatusUpdate(segment: TransitSegment): TransitStatusUpdate {
  return {
    status: segment.status,
    statusMessage: segment.statusMessage,
    estimatedDeparture: segment.estimatedDeparture,
    estimatedArrival: segment.estimatedArrival,
    actualDeparture: segment.actualDeparture,
    actualArrival: segment.actualArrival,
    delayMinutes: segment.delayMinutes,
  };
}

function toStatusPatch(segment: TransitSegment): Partial<Omit<TransitSegment, "id" | "tripId" | "createdBy">> {
  return {
    status: segment.status,
    statusMessage: segment.statusMessage,
    estimatedDeparture: segment.estimatedDeparture,
    estimatedArrival: segment.estimatedArrival,
    actualDeparture: segment.actualDeparture,
    actualArrival: segment.actualArrival,
    delayMinutes: segment.delayMinutes,
  };
}

/**
 * Subscribe to a trip's transit segments and refresh live status with offline
 * caching/fallback (see `fetchTransitStatus`). `refresh` accepts an optional
 * provider; when none is configured the fetch degrades to cached/fallback data.
 */
export function useTransitSegments(tripId: string) {
  const [segments, setSegments] = useState<TransitSegment[]>([]);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  useEffect(() => transitRepository.watchByTrip(tripId, setSegments), [tripId]);

  const refresh = useCallback(
    async (segment: TransitSegment, provider?: TransitStatusProvider | null): Promise<TransitFetchResult> => {
      setRefreshingId(segment.id);
      try {
        const cache: TransitStatusCache = {
          // The segment row already carries its last-known status.
          getCached: async () => toStatusUpdate(segment),
          save: async () => {
            // Persisted by the caller below to avoid a redundant write.
          },
        };
        const result = await fetchTransitStatus(segment, { provider, cache });
        if (result.source === "live") {
          await transitRepository.update(segment.id, toStatusPatch(result.segment));
        }
        return result;
      } finally {
        setRefreshingId(null);
      }
    },
    [],
  );

  return { segments, refreshingId, refresh };
}
