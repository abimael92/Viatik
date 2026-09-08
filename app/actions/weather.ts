"use server";

import { logger } from "@/lib/observability/logger";
import { OpenMeteoProvider } from "@/lib/weather/open-meteo-provider";
import { createClient } from "@/lib/supabase/server-client";
import type { TripWeatherForecast } from "@/features/weather/domain/weather-types";

const provider = new OpenMeteoProvider();

export type FetchTripWeatherForecastResult =
  | { success: true; forecast: TripWeatherForecast }
  | { success: false; error: string };

/**
 * Fetch a weather forecast for a trip. The caller must be an active trip member.
 * Coordinates are read from the authoritative `trips` row in Supabase so that
 * membership is verified before any external API call is made.
 */
export async function fetchTripWeatherForecast(
  tripId: string,
  local?: { latitude: number; longitude: number; timeZone: string | null; startDate: string; endDate: string }
): Promise<FetchTripWeatherForecastResult> {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      return { success: false, error: "Sign in to load weather data." };
    }

    const { data: isMember } = await supabase.rpc("is_active_trip_member", {
      p_trip_id: tripId,
      p_user_id: auth.user.id,
    });
    if (!isMember) {
      return { success: false, error: "You are not a member of this trip." };
    }

    const { data: trip, error } = await supabase
      .from("trips")
      .select("latitude, longitude, time_zone, start_date, end_date")
      .eq("id", tripId)
      .maybeSingle();
    if (error || !trip) {
      logger.warn("Weather fetch could not read trip", { tripId, code: error?.code });
      return { success: false, error: "Trip not found." };
    }

    const latitude = local?.latitude ?? (trip.latitude == null ? null : Number(trip.latitude));
    const longitude = local?.longitude ?? (trip.longitude == null ? null : Number(trip.longitude));
    const startDate = local?.startDate ?? (trip.start_date ? String(trip.start_date) : null);
    const endDate = local?.endDate ?? (trip.end_date ? String(trip.end_date) : null);
    const timeZone = local?.timeZone ?? (trip.time_zone ? String(trip.time_zone) : null);
    if (latitude == null || longitude == null) {
      return { success: false, error: "Set a destination with coordinates first." };
    }
    if (!startDate || !endDate) {
      return { success: false, error: "Set trip dates first." };
    }

    const forecastData = await provider.fetchForecast({ latitude, longitude, startDate, endDate, timeZone });

    const now = new Date().toISOString();
    const locationRevision = buildLocationRevision(latitude, longitude, timeZone, startDate, endDate);

    const forecast: TripWeatherForecast = {
      id: tripId,
      tripId,
      locationRevision,
      fetchedAt: now,
      forecast: forecastData,
      createdBy: auth.user.id,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    return { success: true, forecast };
  } catch (cause) {
    logger.error(
      "Unexpected weather fetch error",
      cause instanceof Error ? cause : new Error(String(cause)),
      { tripId }
    );
    return { success: false, error: "Unable to load weather right now." };
  }
}

function buildLocationRevision(
  latitude: number,
  longitude: number,
  timeZone: string | null,
  startDate: string | null,
  endDate: string | null
): string {
  const coords = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
  const base = timeZone ? `${coords}:${timeZone}` : coords;
  if (!startDate || !endDate) return base;
  return `${base}:${startDate}:${endDate}`;
}
