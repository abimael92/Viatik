import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deleteDatabase, getDatabase, setCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { configureSyncUser } from "@/lib/sync/sync-context";
import { DexieWeatherRepository, weatherRepository } from "@/features/weather/data/dexie-weather-repository";
import type { TripWeatherForecast } from "@/features/weather/domain/weather-types";

const TEST_USER = "test-weather-user";
const TRIP_ID = "00000000-0000-0000-0000-000000000001";

let db: ViatikDatabase;
let repository: DexieWeatherRepository;

function makeForecast(tripId = TRIP_ID, revision = "rev-1"): TripWeatherForecast {
  const now = new Date().toISOString();
  return {
    id: tripId,
    tripId,
    locationRevision: revision,
    fetchedAt: now,
    createdBy: TEST_USER,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    forecast: {
      dates: ["2026-09-01"],
      temperature2mMax: [25],
      temperature2mMin: [15],
      precipitationSum: [0],
      weatherCode: [0],
      windSpeed10mMax: [10],
    },
  };
}

beforeEach(async () => {
  await deleteDatabase(TEST_USER);
  db = getDatabase(TEST_USER);
  setCurrentDatabase(db);
  configureSyncUser(TEST_USER);
  repository = weatherRepository;
  await db.open();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DexieWeatherRepository", () => {
  it("saves and retrieves a forecast", async () => {
    const forecast = makeForecast();
    await repository.saveForecast(forecast, TEST_USER, true);
    const stored = await repository.getForecast(TRIP_ID);
    expect(stored?.tripId).toBe(TRIP_ID);
    expect(stored?.forecast.dates).toEqual(["2026-09-01"]);
  });

  it("creates an outbox mutation for editors", async () => {
    const forecast = makeForecast();
    await repository.saveForecast(forecast, TEST_USER, true);
    const outbox = await db.outboxMutations.toArray();
    expect(outbox).toHaveLength(1);
    expect(outbox[0].entityType).toBe("tripWeatherForecast");
    expect(outbox[0].operation).toBe("insert");
    expect(outbox[0].entityId).toBe(TRIP_ID);
  });

  it("does not enqueue an outbox mutation for viewers", async () => {
    const forecast = makeForecast();
    await repository.saveForecast(forecast, TEST_USER, false);
    const outbox = await db.outboxMutations.toArray();
    expect(outbox).toHaveLength(0);
    const stored = await repository.getForecast(TRIP_ID);
    expect(stored).toBeDefined();
  });

  it("updates an existing forecast as an upsert", async () => {
    const first = makeForecast(TRIP_ID, "rev-1");
    await repository.saveForecast(first, TEST_USER, true);
    const second = makeForecast(TRIP_ID, "rev-2");
    second.forecast.temperature2mMax = [30];
    await repository.saveForecast(second, TEST_USER, true);
    const stored = await repository.getForecast(TRIP_ID);
    expect(stored?.locationRevision).toBe("rev-2");
    expect(stored?.forecast.temperature2mMax).toEqual([30]);
    const outbox = await db.outboxMutations.toArray();
    expect(outbox).toHaveLength(1);
    expect(outbox[0].operation).toBe("insert");
    expect(outbox[0].payload).toMatchObject({
      locationRevision: "rev-2",
      forecast: { temperature2mMax: [30] },
    });
  });

  it("marks forecasts as stale after the configured TTL", async () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const forecast = makeForecast();
    await repository.saveForecast(forecast, TEST_USER, true);
    expect(repository.isStale((await repository.getForecast(TRIP_ID))!, 1)).toBe(false);

    vi.setSystemTime(now + 2 * 60 * 60 * 1000);
    expect(repository.isStale((await repository.getForecast(TRIP_ID))!, 1)).toBe(true);
    vi.useRealTimers();
  });

  it("notifies watch callbacks when the forecast changes", async () => {
    const listener = vi.fn();
    const dispose = repository.watchForecast(TRIP_ID, listener);
    const forecast = makeForecast();
    await repository.saveForecast(forecast, TEST_USER, false);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(listener).toHaveBeenCalled();
    dispose();
  });
});
