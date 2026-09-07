"use server";

import { env } from "@/env.mjs";

export type PlaceSuggestion = { placeId: string; label: string };

export type PlaceDetails = {
  placeId: string;
  label: string;
  latitude: number;
  longitude: number;
  timeZone: string | null;
};

export async function searchDestinations(query: string): Promise<{ suggestions: PlaceSuggestion[]; configured: boolean }> {
  const input = query.trim();
  if (input.length < 2) return { suggestions: [], configured: true };

  if (env.GOOGLE_MAPS_API_KEY) {
    const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": env.GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text",
      },
      body: JSON.stringify({ input, includedPrimaryTypes: ["(cities)"], languageCode: "en" }),
      cache: "no-store",
    });
    if (response.ok) {
      const payload = await response.json() as { suggestions?: Array<{ placePrediction?: { placeId?: string; text?: { text?: string } } }> };
      const suggestions = (payload.suggestions ?? []).flatMap(({ placePrediction }) => placePrediction?.placeId && placePrediction.text?.text ? [{ placeId: placePrediction.placeId, label: placePrediction.text.text }] : []);
      if (suggestions.length > 0) return { suggestions, configured: true };
    }
  }

  try {
    const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
    url.searchParams.set("name", input);
    url.searchParams.set("count", "8");
    url.searchParams.set("language", "en");
    url.searchParams.set("format", "json");
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return { suggestions: [], configured: true };
    const payload = await response.json() as { results?: Array<{ id: number; name: string; latitude: number; longitude: number; timezone?: string; country?: string; admin1?: string }> };
    return {
      configured: true,
      suggestions: (payload.results ?? []).map((place) => ({
        placeId: `open-meteo:${place.latitude}:${place.longitude}:${encodeURIComponent(place.timezone ?? "")}:${place.id}`,
        label: [place.name, place.admin1, place.country].filter(Boolean).join(", "),
      })),
    };
  } catch {
    return { suggestions: [], configured: true };
  }
}

export async function getPlaceDetails(placeId: string, label: string): Promise<PlaceDetails | null> {
  if (placeId.startsWith("open-meteo:")) {
    const [, latitude, longitude, timeZone] = placeId.split(":");
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { placeId, label, latitude: lat, longitude: lng, timeZone: decodeURIComponent(timeZone) || null };
  }
  if (!env.GOOGLE_MAPS_API_KEY) return null;

  const response = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": env.GOOGLE_MAPS_API_KEY,
      "X-Goog-FieldMask": "location,timeZone",
    },
    cache: "no-store",
  });
  if (!response.ok) return null;

  const payload = (await response.json()) as {
    location?: { latitude?: number; longitude?: number };
    timeZone?: { id?: string };
  };
  if (
    payload.location?.latitude == null ||
    payload.location?.longitude == null
  ) {
    return null;
  }

  return {
    placeId,
    label,
    latitude: payload.location.latitude,
    longitude: payload.location.longitude,
    timeZone: payload.timeZone?.id ?? null,
  };
}
