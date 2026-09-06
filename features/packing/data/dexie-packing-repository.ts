import { liveQuery } from "dexie";

import { getCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { logger } from "@/lib/observability/logger";
import type {
  PackingCategory,
  PackingDraft,
  PackingItem,
  PackingRepository,
} from "@/features/packing/domain/packing-types";

function getDb(): ViatikDatabase {
  const db = getCurrentDatabase();
  if (!db) throw new Error("No database is open. Wrap calls in DatabaseProvider.");
  return db;
}

function newPackingItem(
  tripId: string,
  draft: PackingDraft,
  position: number,
  now: string,
): PackingItem {
  return {
    id: crypto.randomUUID(),
    tripId,
    category: draft.category,
    name: draft.name,
    quantity: draft.quantity,
    isPacked: false,
    isSuggested: true,
    suggestedReason: draft.reason,
    position,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

/**
 * Local-only, Dexie-backed packing list. Items are private per-device to-dos
 * and are never pushed through the outbox or synced to Supabase.
 */
export class DexiePackingRepository implements PackingRepository {
  async listByTrip(tripId: string): Promise<PackingItem[]> {
    return getDb()
      .packingItems.where("tripId")
      .equals(tripId)
      .filter((item) => item.deletedAt === null)
      .sortBy("position");
  }

  watchByTrip(tripId: string, onChange: (items: PackingItem[]) => void): () => void {
    const subscription = liveQuery(() => this.listByTrip(tripId)).subscribe({
      next: onChange,
    });
    return () => subscription.unsubscribe();
  }

  async toggle(id: string, isPacked: boolean): Promise<void> {
    const db = getDb();
    const existing = await db.packingItems.get(id);
    if (!existing) return;
    await db.packingItems.put({ ...existing, isPacked, updatedAt: new Date().toISOString() });
  }

  async addCustom(input: {
    tripId: string;
    category: PackingCategory;
    name: string;
    quantity?: number;
  }): Promise<PackingItem> {
    const db = getDb();
    const name = input.name.trim();
    if (!name) throw new Error("Item name is required");

    const now = new Date().toISOString();
    const last = await db.packingItems
      .where("tripId")
      .equals(input.tripId)
      .filter((item) => item.deletedAt === null)
      .last();

    const item: PackingItem = {
      id: crypto.randomUUID(),
      tripId: input.tripId,
      category: input.category,
      name,
      quantity: input.quantity ?? 1,
      isPacked: false,
      isSuggested: false,
      suggestedReason: null,
      position: (last?.position ?? 0) + 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await db.packingItems.add(item);
    logger.debug("Custom packing item added", { tripId: input.tripId, name });
    return item;
  }

  async remove(id: string): Promise<void> {
    const db = getDb();
    await db.packingItems.delete(id);
  }

  async applySuggested(tripId: string, drafts: PackingDraft[]): Promise<PackingItem[]> {
    const db = getDb();
    const now = new Date().toISOString();
    const existing = await db.packingItems
      .where("tripId")
      .equals(tripId)
      .filter((item) => item.deletedAt === null)
      .toArray();

    const userItems = existing.filter((item) => !item.isSuggested);
    const suggestedItems = existing.filter((item) => item.isSuggested);

    const key = (item: Pick<PackingItem, "category" | "name">) =>
      `${item.category}:${item.name.toLowerCase()}`;

    // Preserve a matching custom item (so a user-edited line isn't clobbered),
    // otherwise reuse an existing suggestion (keeping its packed state), else
    // mint a brand-new suggestion.
    const result: PackingItem[] = userItems.map((item) => ({ ...item, updatedAt: now }));

    const generatedKeys = new Set<string>();
    drafts.forEach((draft, index) => {
      const draftKey = key(draft);
      generatedKeys.add(draftKey);

      const match = result.find((item) => key(item) === draftKey && !item.isSuggested);
      if (match) {
        // Keep the user's custom line but align its category/position/reason.
        result[result.indexOf(match)] = {
          ...match,
          category: draft.category,
          position: index,
          suggestedReason: draft.reason,
          isSuggested: false,
          updatedAt: now,
        };
        return;
      }

      const priorSuggestion = suggestedItems.find((item) => key(item) === draftKey);
      if (priorSuggestion) {
        result.push({ ...priorSuggestion, position: index, suggestedReason: draft.reason, updatedAt: now });
        return;
      }

      result.push(newPackingItem(tripId, draft, index, now));
    });

    // Drop stale suggestions that are no longer generated (custom items stay).
    const stale = suggestedItems.filter((item) => !generatedKeys.has(key(item)));

    await db.transaction("rw", db.packingItems, async () => {
      if (result.length) await db.packingItems.bulkPut(result);
      if (stale.length) await db.packingItems.bulkDelete(stale.map((item) => item.id));
    });

    return result.sort((a, b) => a.position - b.position);
  }
}

export const packingRepository = new DexiePackingRepository();
