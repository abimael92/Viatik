import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deleteDatabase, getDatabase, setCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { configureSyncUser } from "@/lib/sync/sync-context";
import { weatherRepository } from "@/features/weather/data/dexie-weather-repository";
import { loadTripWeatherForecast } from "@/features/weather/lib/load-trip-weather-forecast";
import type { Trip } from "@/features/domain/entities";
import type { TripWeatherForecast } from "@/features/weather/domain/weather-types";

vi.mock("@/app/actions/weather", () => ({
  fetchTripWeatherForecast: vi.fn(),
}));

import { fetchTripWeatherForecast } from "@/app/actions/weather";

const TEST_USER = "test-weather-load-user";
const TRIP_ID = "00000000-0000-0000-0000-000000000002";

let db: ViatikDatabase;

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: TRIP_ID,
    ownerId: TEST_USER,
    name: "Test trip",
    description: null,
    destination: "Tokyo",
    latitude: 35.6762,
    longitude: 139.6503,
    placeId: "place-1",
    timeZone: "Asia/Tokyo",
    startDate: "2026-09-01",
    endDate: "2026-09-02",
    coverImageUrl: null,
    adultCount: 2,
    childCount: 0,
    baseCurrency: "USD",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
    ...overrides,
  };
}

function makeForecast(tripId = TRIP_ID): TripWeatherForecast {
  const now = new Date().toISOString();
  return {
    id: tripId,
    tripId,
    locationRevision: `${(35.6762).toFixed(4)},${(139.6503).toFixed(4)}:Asia/Tokyo`,
    fetchedAt: now,
    createdBy: TEST_USER,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    forecast: {
      dates: ["2026-09-01", "2026-09-02"],
      temperature2mMax: [28, 30],
      temperature2mMin: [18, 20],
      precipitationSum: [0, 0],
      weatherCode: [0, 1],
      windSpeed10mMax: [10, 12],
    },
  };
}

beforeEach(async () => {
  await deleteDatabase(TEST_USER);
  db = getDatabase(TEST_USER);
  setCurrentDatabase(db);
  configureSyncUser(TEST_USER);
  await db.open();
  vi.mocked(fetchTripWeatherForecast).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("loadTripWeatherForecast", () => {
  it("returns a cached forecast when it is fresh and the location matches", async () => {
    const trip = makeTrip();
    const forecast = makeForecast();
    await weatherRepository.saveForecast(forecast, TEST_USER, true);

    const result = await loadTripWeatherForecast(trip, TEST_USER, true);

    expect(result.status).toBe("hit");
    expect((result as { forecast: TripWeatherForecast }).forecast.tripId).toBe(TRIP_ID);
    expect(fetchTripWeatherForecast).not.toHaveBeenCalled();
  });

  it("fetches a new forecast when the location revision changed", async () => {
    const trip = makeTrip({ latitude: 35.7 });
    const stale = makeForecast();
    stale.locationRevision = `${(35.6762).toFixed(4)},${(139.6503).toFixed(4)}:Asia/Tokyo`;
    await weatherRepository.saveForecast(stale, TEST_USER, true);

    const fresh = makeForecast();
    fresh.locationRevision = `${(35.7).toFixed(4)},${(139.6503).toFixed(4)}:Asia/Tokyo`;
    vi.mocked(fetchTripWeatherForecast).mockResolvedValue({
      success: true,
      forecast: fresh,
    });

    const result = await loadTripWeatherForecast(trip, TEST_USER, true);

    expect(result.status).toBe("fetched");
    expect(fetchTripWeatherForecast).toHaveBeenCalledWith(TRIP_ID);
  });

  it("returns the stale forecast offline", async () => {
    const trip = makeTrip();
    const stale = makeForecast();
    stale.fetchedAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await weatherRepository.saveForecast(stale, TEST_USER, true);

    vi.stubGlobal("navigator", { onLine: false } as Navigator);

    const result = await loadTripWeatherForecast(trip, TEST_USER, true);

    expect(result.status).toBe("stale-offline");
    expect(fetchTripWeatherForecast).not.toHaveBeenCalled();
  });

  it("reports missing when there are no coordinates", async () => {
    const trip = makeTrip({ latitude: null, longitude: null });
    const result = await loadTripWeatherForecast(trip, TEST_USER, true);
    expect(result.status).toBe("missing");
  });

  it("fetches when no cached forecast exists", async () => {
    const trip = makeTrip();
    const fresh = makeForecast();
    vi.mocked(fetchTripWeatherForecast).mockResolvedValue({
      success: true,
      forecast: fresh,
    });

    const result = await loadTripWeatherForecast(trip, TEST_USER, true);

    expect(result.status).toBe("fetched");
    expect((result as { forecast: TripWeatherForecast }).forecast.tripId).toBe(TRIP_ID);
  });
});
