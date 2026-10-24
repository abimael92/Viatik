import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: { GOOGLE_MAPS_API_KEY: undefined as string | undefined },
}));

vi.mock("@/env.mjs", () => ({ env: mocks.env }));

import { reverseGeocodeDestination } from "@/app/actions/places";

function jsonResponse(payload: object, ok = true): Response {
  return { ok, status: ok ? 200 : 500, json: async () => payload } as Response;
}

describe("reverseGeocodeDestination", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    mocks.env.GOOGLE_MAPS_API_KEY = undefined;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("rejects coordinates outside the valid range without calling a provider", async () => {
    await expect(
      reverseGeocodeDestination({ latitude: 120, longitude: -103 })
    ).resolves.toEqual({ label: null, reason: "invalid" });
    await expect(
      reverseGeocodeDestination({ latitude: 20, longitude: Number.NaN })
    ).resolves.toEqual({ label: null, reason: "invalid" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("prefers Google Geocoding when a Maps key is configured", async () => {
    mocks.env.GOOGLE_MAPS_API_KEY = "test-key";
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        status: "OK",
        results: [
          {
            address_components: [
              { long_name: "Guadalajara", types: ["locality", "political"] },
              { long_name: "Jalisco", types: ["administrative_area_level_1"] },
              { long_name: "Mexico", types: ["country"] },
            ],
          },
        ],
      })
    );

    await expect(
      reverseGeocodeDestination({ latitude: 20.6597, longitude: -103.3496, locale: "es" })
    ).resolves.toEqual({ label: "Guadalajara, Jalisco, Mexico" });

    const request = new URL(vi.mocked(fetch).mock.calls[0]![0] as string);
    expect(request.origin + request.pathname).toBe(
      "https://maps.googleapis.com/maps/api/geocode/json"
    );
    expect(request.searchParams.get("latlng")).toBe("20.6597,-103.3496");
    expect(request.searchParams.get("language")).toBe("es");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to the keyless provider when Google is not configured", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        city: "Guadalajara",
        principalSubdivision: "Jalisco",
        countryName: "México",
      })
    );

    await expect(
      reverseGeocodeDestination({ latitude: 20.6597, longitude: -103.3496, locale: "es" })
    ).resolves.toEqual({ label: "Guadalajara, Jalisco, México" });

    const request = new URL(vi.mocked(fetch).mock.calls[0]![0] as URL);
    expect(request.hostname).toBe("api.bigdatacloud.net");
    expect(request.searchParams.get("latitude")).toBe("20.6597");
    expect(request.searchParams.get("localityLanguage")).toBe("es");
  });

  it("falls back when Google answers without a usable address", async () => {
    mocks.env.GOOGLE_MAPS_API_KEY = "test-key";
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ status: "ZERO_RESULTS", results: [] }))
      .mockResolvedValueOnce(jsonResponse({ city: "Porto", countryName: "Portugal" }));

    await expect(
      reverseGeocodeDestination({ latitude: 41.1579, longitude: -8.6291 })
    ).resolves.toEqual({ label: "Porto, Portugal" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("reports unavailability instead of throwing when both providers fail", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({}, false))
      .mockRejectedValueOnce(new Error("network down"));

    await expect(
      reverseGeocodeDestination({ latitude: 41.1579, longitude: -8.6291 })
    ).resolves.toEqual({ label: null, reason: "unavailable" });
  });

  it("dedupes repeated components in the label", async () => {
    mocks.env.GOOGLE_MAPS_API_KEY = "test-key";
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        status: "OK",
        results: [
          {
            address_components: [
              { long_name: "Mexico City", types: ["locality"] },
              { long_name: "Mexico City", types: ["administrative_area_level_1"] },
              { long_name: "Mexico", types: ["country"] },
            ],
          },
        ],
      })
    );

    await expect(
      reverseGeocodeDestination({ latitude: 19.4326, longitude: -99.1332 })
    ).resolves.toEqual({ label: "Mexico City, Mexico" });
  });
});
