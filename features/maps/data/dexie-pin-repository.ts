import { liveQuery } from "dexie";

import type { TripPin, TripPinCategory } from "@/features/maps/domain/map-types";
import { getCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";

function getDb(): ViatikDatabase {
  const db = getCurrentDatabase();
  if (!db) throw new Error("No database is open. Wrap calls in DatabaseProvider.");
  return db;
}

export interface NewTripPin {
  id: string;
  tripId: string;
  title: string;
  description?: string | null;
  latitude: number;
  longitude: number;
  category: TripPinCategory;
  createdBy: string;
}

/** Storage contract for the local-only dropped map pins. */
export interface PinRepository {
  listByTrip(tripId: string): Promise<TripPin[]>;
  /** Live query: emits the trip's active pins and again on change. */
  watchByTrip(tripId: string, onChange: (pins: TripPin[]) => void): () => void;
  create(input: NewTripPin): Promise<TripPin>;
  update(id: string, patch: Partial<Omit<TripPin, "id" | "tripId">>): Promise<TripPin>;
  /** Soft delete — sets `deletedAt`, does not remove the row. */
  remove(id: string): Promise<void>;
}

/**
 * Dexie-backed, local-only store for dropped map pins. Reads and writes never
 * touch the outbox — pins are device-local annotations (like `profiles`) that
 * stay available offline and are intentionally excluded from cloud sync.
 */
export class DexiePinRepository implements PinRepository {
  async listByTrip(tripId: string): Promise<TripPin[]> {
    return getDb()
      .tripPins.where("tripId")
      .equals(tripId)
      .filter((pin) => pin.deletedAt === null)
      .sortBy("createdAt");
  }

  watchByTrip(tripId: string, onChange: (pins: TripPin[]) => void): () => void {
    const subscription = liveQuery(() => this.listByTrip(tripId)).subscribe({ next: onChange });
    return () => subscription.unsubscribe();
  }

  async create(input: NewTripPin): Promise<TripPin> {
    const now = new Date().toISOString();
    const pin: TripPin = {
      id: input.id,
      tripId: input.tripId,
      title: input.title,
      description: input.description ?? null,
      latitude: input.latitude,
      longitude: input.longitude,
      category: input.category,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await getDb().tripPins.add(pin);
    return pin;
  }

  async update(id: string, patch: Partial<Omit<TripPin, "id" | "tripId">>): Promise<TripPin> {
    const db = getDb();
    const previous = await db.tripPins.get(id);
    if (!previous) throw new Error(`Pin ${id} not found before update`);
    const updatedAt = new Date().toISOString();
    await db.tripPins.update(id, { ...patch, updatedAt });
    const pin = await db.tripPins.get(id);
    if (!pin) throw new Error(`Pin ${id} not found after update`);
    return pin;
  }

  async remove(id: string): Promise<void> {
    const db = getDb();
    const pin = await db.tripPins.get(id);
    if (!pin) return;
    const deletedAt = new Date().toISOString();
    await db.tripPins.put({ ...pin, deletedAt, updatedAt: deletedAt });
  }
}

export const pinRepository = new DexiePinRepository();
