import { liveQuery } from "dexie";

import { getCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import type {
  DailyStepCount,
  DailyStepCountRepository,
} from "@/features/steps/domain/step-types";
import { isIsoDay, validateStepCount } from "@/features/steps/domain/step-types";

function getDb(): ViatikDatabase {
  const db = getCurrentDatabase();
  if (!db) throw new Error("No database is open. Wrap calls in DatabaseProvider.");
  return db;
}

export class DexieStepRepository implements DailyStepCountRepository {
  listByTrip(userId: string, tripId: string): Promise<DailyStepCount[]> {
    return getDb()
      .dailyStepCounts.where("[tripId+userId]")
      .equals([tripId, userId])
      .sortBy("dayDate");
  }

  watchByTrip(userId: string, tripId: string, onChange: (records: DailyStepCount[]) => void): () => void {
    const subscription = liveQuery(() => this.listByTrip(userId, tripId)).subscribe({ next: onChange });
    return () => subscription.unsubscribe();
  }

  async upsert(input: {
    userId: string;
    tripId: string;
    dayDate: string;
    steps: number;
  }): Promise<DailyStepCount> {
    if (!input.userId || !input.tripId) throw new Error("A user and trip are required.");
    if (!isIsoDay(input.dayDate)) throw new Error("Enter a valid calendar day.");
    const trip = await getDb().trips.get(input.tripId);
    if (!trip || trip.deletedAt !== null) throw new Error("That trip is not available.");
    if (
      (trip.startDate && input.dayDate < trip.startDate) ||
      (trip.endDate && input.dayDate > trip.endDate)
    ) {
      throw new Error("Steps must be recorded within the trip dates.");
    }
    const validationError = validateStepCount(input.steps);
    if (validationError) throw new Error(validationError);

    const db = getDb();
    const id = `${input.tripId}:${input.userId}:${input.dayDate}`;
    const existing = await db.dailyStepCounts.get(id);
    const now = new Date().toISOString();
    const record: DailyStepCount = {
      id,
      tripId: input.tripId,
      userId: input.userId,
      dayDate: input.dayDate,
      steps: input.steps,
      source: "automatic",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await db.dailyStepCounts.put(record);
    return record;
  }

  async increment(input: {
    userId: string;
    tripId: string;
    dayDate: string;
    steps: number;
  }): Promise<DailyStepCount> {
    if (!input.userId || !input.tripId) throw new Error("A user and trip are required.");
    if (!Number.isInteger(input.steps) || input.steps < 1) {
      throw new Error("The step increment must be a positive whole number.");
    }

    const db = getDb();
    return db.transaction("rw", db.dailyStepCounts, db.trips, async () => {
      const trip = await db.trips.get(input.tripId);
      if (!trip || trip.deletedAt !== null || trip.status !== "active") {
        throw new Error("Automatic steps require an active trip.");
      }
      if (!isIsoDay(input.dayDate)) throw new Error("Enter a valid calendar day.");
      const startedDay = trip.startedAt ? localDayFromIso(trip.startedAt) : trip.startDate;
      if (startedDay && input.dayDate < startedDay) {
        throw new Error("Steps cannot be recorded before the trip started.");
      }
      if (trip.endDate && input.dayDate > trip.endDate) {
        throw new Error("Steps must be recorded within the trip dates.");
      }

      const id = `${input.tripId}:${input.userId}:${input.dayDate}`;
      const existing = await db.dailyStepCounts.get(id);
      const total = (existing?.steps ?? 0) + input.steps;
      const validationError = validateStepCount(total);
      if (validationError) throw new Error(validationError);
      const now = new Date().toISOString();
      const record: DailyStepCount = {
        id,
        tripId: input.tripId,
        userId: input.userId,
        dayDate: input.dayDate,
        steps: total,
        source: "automatic",
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      await db.dailyStepCounts.put(record);
      return record;
    });
  }
}

function localDayFromIso(value: string): string {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export const stepRepository = new DexieStepRepository();
