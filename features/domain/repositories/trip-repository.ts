import type { Trip } from "@/features/domain/entities";

/**
 * Storage-agnostic contract for reading/writing trips.
 *
 * UI code (and other features) must depend on this interface only — never on
 * Dexie or Supabase directly — so the storage engine can be swapped or
 * layered (e.g. Dexie-backed with a Supabase-syncing decorator) without
 * touching a single component.
 */
export interface TripRepository {
  list(): Promise<Trip[]>;
  getById(id: string): Promise<Trip | undefined>;
  /** Live query: invokes `onChange` with the current list whenever it changes. */
  watchAll(onChange: (trips: Trip[]) => void): () => void;
  watchById(id: string, onChange: (trip: Trip | undefined) => void): () => void;
  create(input: NewTrip): Promise<Trip>;
  update(id: string, patch: Partial<Omit<Trip, "id">>): Promise<Trip>;
  /** Soft delete — sets `deletedAt`, does not remove the row. */
  remove(id: string): Promise<void>;
}

export interface NewTrip {
  id: string;
  ownerId: string;
  name: string;
  description?: string | null;
  destination?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  coverImageUrl?: string | null;
  adultCount?: number;
  childCount?: number;
  baseCurrency?: string;
}
