import { liveQuery } from "dexie";

import type { TripFeedItem } from "@/features/feed/domain/feed-types";
import { getCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { TransactionContext } from "@/lib/db/transaction-context";

function getDb(): ViatikDatabase {
  const db = getCurrentDatabase();
  if (!db) throw new Error("No database is open. Wrap calls in DatabaseProvider.");
  return db;
}

/** Storage contract for the local, collaborative trip activity feed. */
export interface FeedRepository {
  listByTrip(tripId: string): Promise<TripFeedItem[]>;
  /** Live query: emits the trip's feed (newest first) and again on change. */
  watchByTrip(tripId: string, onChange: (items: TripFeedItem[]) => void): () => void;
  /** All feed items across every trip, newest first (for the Trips library). */
  listAll(): Promise<TripFeedItem[]>;
  /** Live query: emits the whole feed (newest first) and again on change. */
  watchAll(onChange: (items: TripFeedItem[]) => void): () => void;
  /** Persist a feed entry outside of an existing transaction (rarely used). */
  log(item: TripFeedItem): Promise<string>;
}

/**
 * Dexie-backed, local-only store for the trip activity feed. Writes never
 * touch the outbox — feed entries are derived from synced expenses/media/
 * activities and are device-local (like `profiles` and `tripPins`).
 */
export class DexieFeedRepository implements FeedRepository {
  async listByTrip(tripId: string): Promise<TripFeedItem[]> {
    const items = await getDb()
      .feedItems.where("tripId")
      .equals(tripId)
      .sortBy("createdAt");
    return items.reverse();
  }

  watchByTrip(tripId: string, onChange: (items: TripFeedItem[]) => void): () => void {
    const subscription = liveQuery(() => this.listByTrip(tripId)).subscribe({ next: onChange });
    return () => subscription.unsubscribe();
  }

  async listAll(): Promise<TripFeedItem[]> {
    const items = await getDb().feedItems.toCollection().sortBy("createdAt");
    return items.reverse();
  }

  watchAll(onChange: (items: TripFeedItem[]) => void): () => void {
    const subscription = liveQuery(() => this.listAll()).subscribe({ next: onChange });
    return () => subscription.unsubscribe();
  }

  async log(item: TripFeedItem): Promise<string> {
    await getDb().feedItems.add(item);
    return item.id;
  }
}

/**
 * Persist a feed entry inside an existing repository transaction so it commits
 * atomically with the domain write that produced it. Callers must include
 * `db.feedItems` in their `TransactionContext.runInTransaction([...])` table
 * list.
 */
export async function emitFeedItem(
  tx: TransactionContext,
  item: TripFeedItem
): Promise<string> {
  await tx.table<TripFeedItem>("feedItems").add(item);
  return item.id;
}

export const feedRepository = new DexieFeedRepository();
