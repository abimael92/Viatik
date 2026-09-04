"use client";

import { fetchTripWeatherForecast } from "@/app/actions/weather";
import type { Trip } from "@/features/domain/entities";
import type { TripWeatherForecast } from "@/features/weather/domain/weather-types";
import { weatherRepository, buildLocationRevision } from "@/features/weather/data/dexie-weather-repository";
import { logger } from "@/lib/observability/logger";

export type LoadTripWeatherForecastResult =
  | { status: "hit"; forecast: TripWeatherForecast }
  | { status: "fetched"; forecast: TripWeatherForecast }
  | { status: "stale-offline"; forecast: TripWeatherForecast }
  | { status: "missing"; error: string }
  | { status: "error"; error: string };

/**
 * Return a weather forecast for a trip, fetching from Open-Meteo only when the
 * cached forecast is missing, stale, or was computed for a different location.
 */
export async function loadTripWeatherForecast(
  trip: Trip,
  userId: string,
  canEdit: boolean,
  maxAgeHours = 1
): Promise<LoadTripWeatherForecastResult> {
  if (!trip.startDate || !trip.endDate) {
    return { status: "missing", error: "Set trip dates to load weather." };
  }

  const existing = await weatherRepository.getForecast(trip.id);
  const expectedRevision =
    trip.latitude != null && trip.longitude != null
      ? buildLocationRevision(trip.latitude, trip.longitude, trip.timeZone)
      : null;

  if (!expectedRevision) {
    if (existing && !weatherRepository.isStale(existing, maxAgeHours)) {
      return { status: "hit", forecast: existing };
    }
    return { status: "missing", error: "Set a destination with coordinates to load weather." };
  }

  if (
    existing &&
    existing.locationRevision === expectedRevision &&
    !weatherRepository.isStale(existing, maxAgeHours)
  ) {
    return { status: "hit", forecast: existing };
  }

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    if (existing) {
      return { status: "stale-offline", forecast: existing };
    }
    return { status: "missing", error: "Connect to the internet to load weather." };
  }

  const result = await fetchTripWeatherForecast(trip.id);
  if (!result?.success) {
    logger.warn("Weather fetch failed", { tripId: trip.id, error: result.error });
    if (existing) {
      return { status: "stale-offline", forecast: existing };
    }
    return { status: "error", error: result.error };
  }

  const forecast = result.forecast;
  await weatherRepository.saveForecast(forecast, userId, canEdit);
  return { status: "fetched", forecast };
}
