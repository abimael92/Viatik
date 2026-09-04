import { liveQuery } from "dexie";

import { getCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { TransactionContext } from "@/lib/db/transaction-context";
import { append } from "@/lib/sync/outbox-transactional";
import { logger } from "@/lib/observability/logger";
import type { TripWeatherForecast, WeatherForecastRepository } from "@/features/weather/domain/weather-types";

function getDb(): ViatikDatabase {
  const db = getCurrentDatabase();
  if (!db) throw new Error("No database is open. Wrap calls in DatabaseProvider.");
  return db;
}

const DEFAULT_MAX_AGE_HOURS = 1;

/** Build a revision key from the inputs that affect the forecast result. */
export function buildLocationRevision(
  latitude: number,
  longitude: number,
  timeZone: string | null
): string {
  const coords = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
  return timeZone ? `${coords}:${timeZone}` : coords;
}

export class DexieWeatherRepository implements WeatherForecastRepository {
  async getForecast(tripId: string): Promise<TripWeatherForecast | undefined> {
    return getDb().tripWeatherForecasts.get(tripId);
  }

  watchForecast(tripId: string, onChange: (forecast?: TripWeatherForecast) => void): () => void {
    const subscription = liveQuery(() => getDb().tripWeatherForecasts.get(tripId)).subscribe({
      next: (value) => onChange(value ?? undefined),
    });
    return () => subscription.unsubscribe();
  }

  async saveForecast(forecast: TripWeatherForecast, userId: string, canEdit: boolean): Promise<void> {
    const db = getDb();
    const toStore: TripWeatherForecast = {
      ...forecast,
      createdBy: userId,
    };

    const existing = await db.tripWeatherForecasts.get(forecast.tripId);

    if (!canEdit) {
      await db.tripWeatherForecasts.put(toStore);
      logger.debug("Weather forecast cached locally (viewer)", { tripId: forecast.tripId });
      return;
    }

    await TransactionContext.runInTransaction([db.tripWeatherForecasts], async (ctx) => {
      await ctx.table<TripWeatherForecast>("tripWeatherForecasts").put(toStore);
      const operation = existing ? "update" : "insert";
      await append(
        "tripWeatherForecast",
        operation,
        toStore,
        { tx: ctx, baseUpdatedAt: existing ? existing.updatedAt : null }
      );
      logger.debug("Weather forecast saved and queued for sync", { tripId: forecast.tripId });
    });
  }

  isStale(forecast: TripWeatherForecast, maxAgeHours = DEFAULT_MAX_AGE_HOURS): boolean {
    const fetchedAt = new Date(forecast.fetchedAt).getTime();
    if (Number.isNaN(fetchedAt)) return true;
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
    return Date.now() - fetchedAt > maxAgeMs;
  }
}

export const weatherRepository = new DexieWeatherRepository();
