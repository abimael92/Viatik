import { liveQuery } from "dexie";

import { getCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { logger } from "@/lib/observability/logger";
import type {
  NewTransitSegment,
  TransitRepository,
  TransitSegment,
} from "@/features/transit/domain/transit-types";

function getDb(): ViatikDatabase {
  const db = getCurrentDatabase();
  if (!db) throw new Error("No database is open. Wrap calls in DatabaseProvider.");
  return db;
}

/**
 * Local-only, Dexie-backed transit segments. Flights/trains are device-local
 * logistics (like `packingItems`/`polls`) and are never pushed through the
 * outbox. Live status is fetched by the service layer and cached onto each
 * segment row.
 */
export class DexieTransitRepository implements TransitRepository {
  async listByTrip(tripId: string): Promise<TransitSegment[]> {
    return getDb()
      .transitSegments.where("tripId")
      .equals(tripId)
      .filter((segment) => segment.deletedAt === null)
      .sortBy("scheduledDeparture");
  }

  async listByDay(tripId: string, dayDate: string): Promise<TransitSegment[]> {
    return getDb()
      .transitSegments.where("[tripId+dayDate]")
      .equals([tripId, dayDate])
      .filter((segment) => segment.deletedAt === null)
      .sortBy("scheduledDeparture");
  }

  watchByTrip(tripId: string, onChange: (segments: TransitSegment[]) => void): () => void {
    const subscription = liveQuery(() => this.listByTrip(tripId)).subscribe({ next: onChange });
    return () => subscription.unsubscribe();
  }

  async create(input: NewTransitSegment): Promise<TransitSegment> {
    const db = getDb();
    const now = new Date().toISOString();
    const segment: TransitSegment = {
      id: crypto.randomUUID(),
      tripId: input.tripId,
      mode: input.mode,
      dayDate: input.dayDate,
      carrier: input.carrier.trim(),
      carrierCode: input.carrierCode?.trim() || null,
      number: input.number.trim(),
      gate: input.gate?.trim() || null,
      terminal: input.terminal?.trim() || null,
      platform: input.platform?.trim() || null,
      origin: input.origin?.trim() || null,
      destination: input.destination?.trim() || null,
      scheduledDeparture: input.scheduledDeparture,
      scheduledArrival: input.scheduledArrival ?? null,
      status: "scheduled",
      statusMessage: null,
      actualDeparture: null,
      actualArrival: null,
      estimatedDeparture: null,
      estimatedArrival: null,
      delayMinutes: null,
      ticketImage: input.ticketImage ?? null,
      ticketImageName: input.ticketImageName ?? null,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await db.transitSegments.add(segment);
    logger.debug("Transit segment created locally", { transitId: segment.id, tripId: segment.tripId });
    return segment;
  }

  async update(
    id: string,
    patch: Partial<Omit<TransitSegment, "id" | "tripId" | "createdBy">>,
  ): Promise<TransitSegment> {
    const db = getDb();
    const existing = await db.transitSegments.get(id);
    if (!existing) throw new Error(`Transit segment ${id} not found`);
    const updatedAt = new Date().toISOString();
    const updated = { ...existing, ...patch, updatedAt };
    await db.transitSegments.put(updated);
    return updated;
  }

  async remove(id: string): Promise<void> {
    const db = getDb();
    const existing = await db.transitSegments.get(id);
    if (!existing) return;
    const deletedAt = new Date().toISOString();
    await db.transitSegments.put({ ...existing, deletedAt, updatedAt: deletedAt });
  }
}

export const transitRepository = new DexieTransitRepository();
