import { liveQuery } from "dexie";

import { getCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { logger } from "@/lib/observability/logger";
import {
  normalizePackingName,
  type PackingCategory,
  type PackingDraft,
  type PackingItem,
  type PackingRepository,
} from "@/features/packing/domain/packing-types";

function getDb(): ViatikDatabase {
  const db = getCurrentDatabase();
  if (!db) throw new Error("No database is open. Wrap calls in DatabaseProvider.");
  return db;
}

function uniquePackingItems(items: PackingItem[]): PackingItem[] {
  const unique = new Map<string, PackingItem>();
  for (const item of [...items].sort((a, b) => a.position - b.position)) {
    const key = normalizePackingName(item.name);
    const existing = unique.get(key);
    if (!existing || (existing.isSuggested && !item.isSuggested)) unique.set(key, item);
  }
  return [...unique.values()].sort((a, b) => a.position - b.position);
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
    const items = await getDb()
      .packingItems.where("tripId")
      .equals(tripId)
      .filter((item) => item.deletedAt === null)
      .sortBy("position");
    return uniquePackingItems(items);
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

  async setPacked(ids: string[], isPacked: boolean): Promise<void> {
    if (!ids.length) return;
    const db = getDb();
    const now = new Date().toISOString();
    await db.transaction("rw", db.packingItems, async () => {
      for (const id of ids) {
        const existing = await db.packingItems.get(id);
        if (existing) await db.packingItems.put({ ...existing, isPacked, updatedAt: now });
      }
    });
  }

  async updateQuantity(id: string, quantity: number): Promise<void> {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw new Error("Quantity must be a whole number from 1 to 99.");
    }
    const db = getDb();
    const existing = await db.packingItems.get(id);
    if (existing) await db.packingItems.put({ ...existing, quantity, updatedAt: new Date().toISOString() });
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

    const existing = await this.listByTrip(input.tripId);
    const duplicate = existing.find((item) => normalizePackingName(item.name) === normalizePackingName(name));
    if (duplicate) return duplicate;

    const now = new Date().toISOString();
    const last = existing.at(-1);

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

  async resetToSuggested(tripId: string, drafts: PackingDraft[]): Promise<PackingItem[]> {
    const db = getDb();
    await db.packingItems.where("tripId").equals(tripId).delete();
    return this.applySuggested(tripId, drafts);
  }

  async applySuggested(tripId: string, drafts: PackingDraft[]): Promise<PackingItem[]> {
    const db = getDb();
    const now = new Date().toISOString();
    const existing = uniquePackingItems(
      await db.packingItems
        .where("tripId")
        .equals(tripId)
        .filter((item) => item.deletedAt === null)
        .toArray(),
    );

    const userItems = existing.filter((item) => !item.isSuggested);
    const suggestedItems = existing.filter((item) => item.isSuggested);

    const key = (item: Pick<PackingItem, "name">) => normalizePackingName(item.name);
    const uniqueDrafts = drafts.filter((draft, index, all) =>
      all.findIndex((candidate) => key(candidate) === key(draft)) === index,
    );

    // Preserve a matching custom item (so a user-edited line isn't clobbered),
    // otherwise reuse an existing suggestion (keeping its packed state), else
    // mint a brand-new suggestion.
    const result: PackingItem[] = userItems.map((item) => ({ ...item, updatedAt: now }));

    const generatedKeys = new Set<string>();
    uniqueDrafts.forEach((draft, index) => {
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
