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
  tripId: string
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

    if (trip.latitude == null || trip.longitude == null) {
      return { success: false, error: "Set a destination with coordinates first." };
    }
    if (!trip.start_date || !trip.end_date) {
      return { success: false, error: "Set trip dates first." };
    }

    const forecastData = await provider.fetchForecast({
      latitude: Number(trip.latitude),
      longitude: Number(trip.longitude),
      startDate: String(trip.start_date),
      endDate: String(trip.end_date),
      timeZone: trip.time_zone ? String(trip.time_zone) : null,
    });

    const now = new Date().toISOString();
    const locationRevision = buildLocationRevision(
      Number(trip.latitude),
      Number(trip.longitude),
      trip.time_zone ? String(trip.time_zone) : null
    );

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

function buildLocationRevision(latitude: number, longitude: number, timeZone: string | null): string {
  const coords = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
  return timeZone ? `${coords}:${timeZone}` : coords;
}
