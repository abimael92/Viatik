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
  if (!env.GOOGLE_MAPS_API_KEY) return { suggestions: [], configured: false };
  if (input.length < 2) return { suggestions: [], configured: true };

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
  if (!response.ok) return { suggestions: [], configured: true };

  const payload = await response.json() as { suggestions?: Array<{ placePrediction?: { placeId?: string; text?: { text?: string } } }> };
  return {
    configured: true,
    suggestions: (payload.suggestions ?? []).flatMap(({ placePrediction }) => placePrediction?.placeId && placePrediction.text?.text ? [{ placeId: placePrediction.placeId, label: placePrediction.text.text }] : []),
  };
}

export async function getPlaceDetails(placeId: string, label: string): Promise<PlaceDetails | null> {
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
