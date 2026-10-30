"use server";

import { env } from "@/env.mjs";

export type PlaceSuggestion = { placeId: string; label: string };

export type PlaceDetails = {
  placeId: string;
  label: string;
  name: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  timeZone: string | null;
};

async function searchPlaces(query: string, citiesOnly: boolean): Promise<{ suggestions: PlaceSuggestion[]; configured: boolean }> {
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
      body: JSON.stringify({ input, ...(citiesOnly ? { includedPrimaryTypes: ["(cities)"] } : {}), languageCode: "en" }),
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

export async function searchDestinations(query: string) {
  return searchPlaces(query, true);
}

export async function searchActivityPlaces(query: string) {
  return searchPlaces(query, false);
}

export type ReverseGeocodeResult =
  | { label: string }
  | { label: null; reason: "invalid" | "unavailable" };

type ReverseGeocodeLocale = "en" | "es";

function isUsableCoordinate(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function joinLabel(parts: Array<string | undefined>): string {
  const seen = new Set<string>();
  const label = parts.flatMap((part) => {
    const trimmed = part?.trim();
    if (!trimmed || seen.has(trimmed)) return [];
    seen.add(trimmed);
    return [trimmed];
  });
  return label.slice(0, 3).join(", ");
}

async function reverseGeocodeWithGoogle(
  latitude: number,
  longitude: number,
  locale: ReverseGeocodeLocale
): Promise<string | null> {
  if (!env.GOOGLE_MAPS_API_KEY) return null;

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("latlng", `${latitude},${longitude}`);
  url.searchParams.set("language", locale);
  url.searchParams.set("key", env.GOOGLE_MAPS_API_KEY);

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return null;

  const payload = (await response.json()) as {
    status?: string;
    results?: Array<{
      address_components?: Array<{ long_name?: string; types?: string[] }>;
    }>;
  };
  if (payload.status !== "OK") return null;

  const components = payload.results?.[0]?.address_components ?? [];
  const byType = (type: string) =>
    components.find((component) => component.types?.includes(type))?.long_name;

  const label = joinLabel([
    byType("locality") ?? byType("postal_town") ?? byType("administrative_area_level_2"),
    byType("administrative_area_level_1"),
    byType("country"),
  ]);
  return label || null;
}

/**
 * Keyless fallback so the quick action still works without a Maps key. Only the
 * coordinates leave the server; the traveler's identity never does.
 */
async function reverseGeocodeWithBigDataCloud(
  latitude: number,
  longitude: number,
  locale: ReverseGeocodeLocale
): Promise<string | null> {
  const url = new URL("https://api.bigdatacloud.net/data/reverse-geocode-client");
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("localityLanguage", locale);

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return null;

  const payload = (await response.json()) as {
    city?: string;
    locality?: string;
    principalSubdivision?: string;
    countryName?: string;
  };
  const label = joinLabel([
    payload.city ?? payload.locality,
    payload.principalSubdivision,
    payload.countryName,
  ]);
  return label || null;
}

/**
 * Turns a single device position into a city label for the Scout departure
 * field. Coordinates are validated, used once, and never returned or stored.
 */
export async function reverseGeocodeDestination({
  latitude,
  longitude,
  locale = "en",
}: {
  latitude: number;
  longitude: number;
  locale?: ReverseGeocodeLocale;
}): Promise<ReverseGeocodeResult> {
  if (!isUsableCoordinate(latitude, longitude)) return { label: null, reason: "invalid" };

  try {
    const label =
      (await reverseGeocodeWithGoogle(latitude, longitude, locale)) ??
      (await reverseGeocodeWithBigDataCloud(latitude, longitude, locale));
    return label ? { label } : { label: null, reason: "unavailable" };
  } catch {
    return { label: null, reason: "unavailable" };
  }
}

export type DestinationCoordinates = {
  placeId: string;
  latitude: number;
  longitude: number;
  timeZone: string | null;
};

function comparableCity(value: string): string {
  return (value.split(",")[0] ?? value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Turns a Scout "City, Country" label into coordinates for the map panel.
 * Uses the Places autocomplete first and the keyless geocoder fallback, so it
 * works without a Google key. Returns `null` instead of throwing: the map is an
 * optional enhancement and must never block a local write.
 */
export async function resolveDestinationCoordinates(
  label: string
): Promise<DestinationCoordinates | null> {
  const input = label.trim().slice(0, 120);
  if (input.length < 3) return null;

  try {
    const { suggestions } = await searchDestinations(input);
    if (suggestions.length === 0) return null;

    const wanted = comparableCity(input);
    const match =
      suggestions.find((suggestion) => comparableCity(suggestion.label) === wanted) ??
      suggestions.find((suggestion) => {
        const candidate = comparableCity(suggestion.label);
        return (
          candidate.length > 0 &&
          (candidate.startsWith(wanted) || wanted.startsWith(candidate))
        );
      }) ??
      suggestions[0]!;

    const details = await getPlaceDetails(match.placeId, match.label);
    if (!details) return null;
    return {
      placeId: details.placeId,
      latitude: details.latitude,
      longitude: details.longitude,
      timeZone: details.timeZone,
    };
  } catch {
    return null;
  }
}

export async function getPlaceDetails(placeId: string, label: string): Promise<PlaceDetails | null> {
  if (placeId.startsWith("open-meteo:")) {
    const [, latitude, longitude, timeZone] = placeId.split(":");
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { placeId, label, name: label.split(",")[0]?.trim() || label, formattedAddress: label, latitude: lat, longitude: lng, timeZone: decodeURIComponent(timeZone) || null };
  }
  if (!env.GOOGLE_MAPS_API_KEY) return null;

  const response = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": env.GOOGLE_MAPS_API_KEY,
      "X-Goog-FieldMask": "displayName,formattedAddress,location,timeZone",
    },
    cache: "no-store",
  });
  if (!response.ok) return null;

  const payload = (await response.json()) as {
    displayName?: { text?: string };
    formattedAddress?: string;
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
    name: payload.displayName?.text ?? label.split(",")[0]?.trim() ?? label,
    formattedAddress: payload.formattedAddress ?? label,
    latitude: payload.location.latitude,
    longitude: payload.location.longitude,
    timeZone: payload.timeZone?.id ?? null,
  };
}
