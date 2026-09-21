import { liveQuery } from "dexie";

import { getCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { TransactionContext } from "@/lib/db/transaction-context";
import { logger } from "@/lib/observability/logger";
import { append } from "@/lib/sync/outbox-transactional";
import type {
  NewTripShareLink,
  ShareLinkRepository,
  TripShareLink,
} from "@/features/sharing/domain/share-types";
import { generateShareSlug } from "@/features/sharing/lib/share-slug";

function getDb(): ViatikDatabase {
  const db = getCurrentDatabase();
  if (!db) throw new Error("No database is open. Wrap calls in DatabaseProvider.");
  return db;
}

/**
 * Dexie-backed implementation of `ShareLinkRepository`. Reads/writes IndexedDB
 * and rides the outbox (via `append`) so links sync to the remote
 * `trip_share_links` table — the data the public `/share/[slug]` route reads.
 */
export class DexieShareLinkRepository implements ShareLinkRepository {
  async listByTrip(tripId: string): Promise<TripShareLink[]> {
    return getDb()
      .shareLinks.where("tripId")
      .equals(tripId)
      .filter((link) => link.deletedAt === null)
      .sortBy("createdAt");
  }

  watchByTrip(tripId: string, onChange: (links: TripShareLink[]) => void): () => void {
    const subscription = liveQuery(() => this.listByTrip(tripId)).subscribe({ next: onChange });
    return () => subscription.unsubscribe();
  }

  async getBySlug(slug: string): Promise<TripShareLink | undefined> {
    return getDb()
      .shareLinks.where("slug")
      .equals(slug)
      .filter((link) => link.deletedAt === null)
      .first();
  }

  async create(input: NewTripShareLink): Promise<TripShareLink> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.shareLinks], async (ctx) => {
      const now = new Date().toISOString();
      const link: TripShareLink = {
        id: crypto.randomUUID(),
        tripId: input.tripId,
        slug: generateShareSlug(),
        label: input.label?.trim() ? input.label.trim() : null,
        createdBy: input.createdBy,
        allowItinerary: input.allowItinerary ?? true,
        allowMap: input.allowMap ?? true,
        allowGallery: input.allowGallery ?? true,
        active: true,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      await ctx.table<TripShareLink>("shareLinks").add(link);
      await append("tripShareLink", "insert", link, { tx: ctx, baseUpdatedAt: null });
      logger.debug("Share link created locally", { shareId: link.id, tripId: link.tripId });
      return link;
    });
  }

  async update(
    id: string,
    patch: Partial<Omit<TripShareLink, "id" | "tripId" | "slug" | "createdBy">>
  ): Promise<TripShareLink> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.shareLinks], async (ctx) => {
      const previous = await ctx.table<TripShareLink>("shareLinks").get(id);
      if (!previous) throw new Error(`Share link ${id} not found`);
      const updatedAt = new Date().toISOString();
      await ctx.table<TripShareLink>("shareLinks").update(id, { ...patch, updatedAt });
      const link = await ctx.table<TripShareLink>("shareLinks").get(id);
      if (!link) throw new Error(`Share link ${id} not found after update`);
      await append("tripShareLink", "update", link, { tx: ctx, baseUpdatedAt: previous.updatedAt });
      return link;
    });
  }

  async remove(id: string): Promise<void> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.shareLinks], async (ctx) => {
      const link = await ctx.table<TripShareLink>("shareLinks").get(id);
      if (!link) return;
      const deletedAt = new Date().toISOString();
      const updated = { ...link, deletedAt, active: false, updatedAt: deletedAt };
      await ctx.table<TripShareLink>("shareLinks").put(updated);
      await append("tripShareLink", "update", updated, { tx: ctx, baseUpdatedAt: link.updatedAt });
      logger.debug("Share link deleted locally", { shareId: id });
    });
  }
}

export const shareLinkRepository = new DexieShareLinkRepository();
