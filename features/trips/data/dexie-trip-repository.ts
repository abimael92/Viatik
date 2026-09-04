import { liveQuery } from "dexie";

import { getCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { TransactionContext } from "@/lib/db/transaction-context";
import type { Trip, TripMember } from "@/features/domain/entities";
import type { NewTrip, TripRepository } from "@/features/domain/repositories/trip-repository";
import { assertValidTripDates } from "@/features/trips/lib/trip-duration";
import { append } from "@/lib/sync/outbox-transactional";
import { logger } from "@/lib/observability/logger";
import { getSyncUser } from "@/lib/sync/sync-context";

function getDb(): ViatikDatabase {
  const db = getCurrentDatabase();
  if (!db) throw new Error("No database is open. Wrap calls in DatabaseProvider.");
  return db;
}

/** Dexie-backed implementation of `TripRepository` — reads/writes IndexedDB only. */
export class DexieTripRepository implements TripRepository {
  async list(): Promise<Trip[]> {
    const db = getDb();
    const userId = getSyncUser();
    if (!userId) return db.trips.filter((trip) => trip.deletedAt === null).toArray();
    const memberships = await db.tripMembers.where("userId").equals(userId).toArray();
    const accessible = new Set(memberships.map((member) => member.tripId));
    return db.trips.filter((trip) => trip.deletedAt === null && (trip.ownerId === userId || accessible.has(trip.id))).toArray();
  }

  async getById(id: string): Promise<Trip | undefined> {
    const db = getDb();
    const trip = await db.trips.get(id);
    if (!trip || trip.deletedAt !== null) return undefined;
    const userId = getSyncUser();
    if (!userId || trip.ownerId === userId) return trip;
    return await db.tripMembers.where("[tripId+userId]").equals([id, userId]).first() ? trip : undefined;
  }

  watchAll(onChange: (trips: Trip[]) => void): () => void {
    const subscription = liveQuery(() => this.list()).subscribe({ next: onChange });
    return () => subscription.unsubscribe();
  }

  watchById(id: string, onChange: (trip: Trip | undefined) => void): () => void {
    const subscription = liveQuery(() => this.getById(id)).subscribe({ next: onChange });
    return () => subscription.unsubscribe();
  }

  async create(input: NewTrip): Promise<Trip> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.trips, db.tripMembers], async (ctx) => {
      const now = new Date().toISOString();
      const trip: Trip = {
        id: input.id,
        ownerId: input.ownerId,
        name: input.name,
        description: input.description ?? null,
        destination: input.destination ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        placeId: input.placeId ?? null,
        timeZone: input.timeZone ?? null,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        coverImageUrl: input.coverImageUrl ?? null,
        adultCount: input.adultCount ?? 1,
        childCount: input.childCount ?? 0,
        baseCurrency: input.baseCurrency ?? "USD",
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      assertValidTripDates(trip.startDate, trip.endDate);
      await ctx.table<Trip>("trips").add(trip);
      await append("trip", "insert", trip, { tx: ctx, baseUpdatedAt: null });

      const membership: TripMember = {
        id: crypto.randomUUID(),
        tripId: trip.id,
        userId: trip.ownerId,
        role: "owner",
        invitedBy: null,
        joinedAt: now,
        createdAt: now,
        updatedAt: now,
      };
      await ctx.table<TripMember>("tripMembers").put(membership);
      await append("tripMember", "insert", membership, { tx: ctx, baseUpdatedAt: null });

      logger.debug("Trip created locally", { tripId: trip.id });
      return trip;
    });
  }

  async update(id: string, patch: Partial<Omit<Trip, "id">>): Promise<Trip> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.trips], async (ctx) => {
      const previous = await ctx.table<Trip>("trips").get(id);
      if (!previous) throw new Error(`Trip ${id} not found before update`);
      if ("startDate" in patch || "endDate" in patch) {
        const effectiveStartDate = patch.startDate !== undefined ? patch.startDate : previous.startDate;
        const effectiveEndDate = patch.endDate !== undefined ? patch.endDate : previous.endDate;
        assertValidTripDates(effectiveStartDate, effectiveEndDate);
      }
      const updatedAt = new Date().toISOString();
      await ctx.table<Trip>("trips").update(id, { ...patch, updatedAt });
      const trip = await ctx.table<Trip>("trips").get(id);
      if (!trip) throw new Error(`Trip ${id} not found after update`);
      await append("trip", "update", trip, { tx: ctx, baseUpdatedAt: previous.updatedAt });
      logger.debug("Trip updated locally", { tripId: trip.id });
      return trip;
    });
  }

  async remove(id: string): Promise<void> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.trips], async (ctx) => {
      const trip = await ctx.table<Trip>("trips").get(id);
      if (!trip) return;
      const deletedAt = new Date().toISOString();
      const updated = { ...trip, deletedAt, updatedAt: deletedAt };
      await ctx.table<Trip>("trips").put(updated);
      await append("trip", "update", updated, { tx: ctx, baseUpdatedAt: trip.updatedAt });
      logger.debug("Trip deleted locally", { tripId: id });
    });
  }
}

export const tripRepository = new DexieTripRepository();
