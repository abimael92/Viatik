"use server";

import { env } from "@/env.mjs";

export type PlaceSuggestion = { placeId: string; label: string };

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
