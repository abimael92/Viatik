import { liveQuery } from "dexie";

import { db } from "@/lib/db/dexie";
import type { Trip } from "@/features/domain/entities";
import type { NewTrip, TripRepository } from "@/features/domain/repositories/trip-repository";
import { enqueueMutation } from "@/lib/sync/outbox";

/** Dexie-backed implementation of `TripRepository` — reads/writes IndexedDB only. */
export class DexieTripRepository implements TripRepository {
  async list(): Promise<Trip[]> {
    return db.trips.filter((trip) => trip.deletedAt === null).toArray();
  }

  async getById(id: string): Promise<Trip | undefined> {
    const trip = await db.trips.get(id);
    return trip && trip.deletedAt === null ? trip : undefined;
  }

  watchAll(onChange: (trips: Trip[]) => void): () => void {
    const subscription = liveQuery(() =>
      db.trips.filter((trip) => trip.deletedAt === null).toArray()
    ).subscribe({ next: onChange });
    return () => subscription.unsubscribe();
  }

  watchById(id: string, onChange: (trip: Trip | undefined) => void): () => void {
    const subscription = liveQuery(async () => {
      const trip = await db.trips.get(id);
      return trip && trip.deletedAt === null ? trip : undefined;
    }).subscribe({ next: onChange });
    return () => subscription.unsubscribe();
  }

  async create(input: NewTrip): Promise<Trip> {
    const now = new Date().toISOString();
    const trip: Trip = {
      id: input.id,
      ownerId: input.ownerId,
      name: input.name,
      description: input.description ?? null,
      destination: input.destination ?? null,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      coverImageUrl: input.coverImageUrl ?? null,
      baseCurrency: input.baseCurrency ?? "USD",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await db.trips.add(trip);
    await enqueueMutation({
      entityType: "trip",
      entityId: trip.id,
      tripId: trip.id,
      operation: "insert",
      payload: trip as unknown as Record<string, unknown>,
      mutatedAt: trip.updatedAt,
    });
    return trip;
  }

  async update(id: string, patch: Partial<Omit<Trip, "id">>): Promise<Trip> {
    const updatedAt = new Date().toISOString();
    await db.trips.update(id, { ...patch, updatedAt });
    const trip = await db.trips.get(id);
    if (!trip) throw new Error(`Trip ${id} not found after update`);
    await enqueueMutation({
      entityType: "trip",
      entityId: trip.id,
      tripId: trip.id,
      operation: "update",
      payload: trip as unknown as Record<string, unknown>,
      mutatedAt: trip.updatedAt,
    });
    return trip;
  }

  async remove(id: string): Promise<void> {
    const deletedAt = new Date().toISOString();
    await db.trips.update(id, { deletedAt, updatedAt: deletedAt });
    await enqueueMutation({
      entityType: "trip",
      entityId: id,
      tripId: id,
      operation: "delete",
      payload: null,
      mutatedAt: deletedAt,
    });
  }
}

export const tripRepository = new DexieTripRepository();
