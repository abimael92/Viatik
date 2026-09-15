import { liveQuery } from "dexie";

import { getCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { TransactionContext } from "@/lib/db/transaction-context";
import type { MediaRepository, NewTripMedia } from "@/features/domain/repositories/media-repository";
import type { TripMedia } from "@/features/domain/entities-media";
import { buildMediaFeed, materializeFeedItem } from "@/features/feed/lib/feed-builder";
import { emitFeedItem } from "@/features/feed/data/dexie-feed-repository";
import { append, type OutboxAppendData } from "@/lib/sync/outbox-transactional";
import { getSyncUser } from "@/lib/sync/sync-context";

function getDb(): ViatikDatabase {
  const db = getCurrentDatabase();
  if (!db) throw new Error("No database is open. Wrap calls in DatabaseProvider.");
  return db;
}

export class DexieMediaRepository implements MediaRepository {
  listByTrip(tripId: string, activityId: string | null = null): Promise<TripMedia[]> {
    const db = getDb();
    return db.tripMedia.where("tripId").equals(tripId).filter((item) => item.activityId === activityId && item.deletedAt === null).reverse().sortBy("createdAt");
  }

  watchByTrip(tripId: string, activityId: string | null, onChange: (media: TripMedia[]) => void): () => void {
    const subscription = liveQuery(() => this.listByTrip(tripId, activityId)).subscribe({ next: onChange });
    return () => subscription.unsubscribe();
  }

  async create(input: NewTripMedia): Promise<TripMedia> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.tripMedia, db.feedItems], async (ctx) => {
      const now = new Date().toISOString();
      const extension = input.blob.type === "image/png" ? "png" : input.blob.type === "image/webp" ? "webp" : "jpg";
      const media: TripMedia = {
        id: input.id,
        tripId: input.tripId,
        activityId: input.activityId ?? null,
        caption: input.caption ?? null,
        takenAt: input.takenAt ?? null,
        blob: input.blob,
        storagePath: `${input.tripId}/${input.id}.${extension}`,
        uploadedUrl: null,
        signedUrlExpiresAt: null,
        contentType: input.blob.type || "image/jpeg",
        byteSize: input.blob.size,
        createdBy: input.createdBy,
        updatedBy: input.createdBy,
        deletedBy: null,
        restoredAt: null,
        restoredBy: null,
        version: 1,
        uploadStatus: "pending",
        uploadProgress: 0,
        uploadError: null,
        uploadAttempts: 0,
        nextUploadAt: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      await ctx.table<TripMedia>("tripMedia").add(media);
      await emitFeedItem(ctx, materializeFeedItem(buildMediaFeed("uploaded_photo", media, media.createdBy)));
      if (typeof window !== "undefined") window.dispatchEvent(new Event("viatik:sync-request"));
      return media;
    });
  }

  async updateCaption(id: string, caption: string | null): Promise<void> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.tripMedia, db.feedItems], async (ctx) => {
      const media = await ctx.table<TripMedia>("tripMedia").get(id);
      if (!media) throw new Error("Photo not found");
      const updatedAt = new Date().toISOString();
      const updated = { ...media, caption, updatedAt };
      await ctx.table<TripMedia>("tripMedia").put(updated);
      await emitFeedItem(ctx, materializeFeedItem(buildMediaFeed("updated_photo", updated, getSyncUser() ?? updated.createdBy)));
      if (media.uploadStatus === "uploaded") {
        await append("media", "update", mediaPayload(updated) as OutboxAppendData, { tx: ctx, baseUpdatedAt: media.updatedAt });
      }
    });
  }

  async remove(id: string): Promise<void> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.tripMedia, db.feedItems], async (ctx) => {
      const media = await ctx.table<TripMedia>("tripMedia").get(id);
      if (!media) return;
      const deletedAt = new Date().toISOString();
      const updated = { ...media, deletedAt, updatedAt: deletedAt };
      await ctx.table<TripMedia>("tripMedia").put(updated);
      await emitFeedItem(ctx, materializeFeedItem(buildMediaFeed("deleted_photo", updated, getSyncUser() ?? updated.createdBy)));
      if (media.uploadStatus === "uploaded") {
        await append("media", "update", mediaPayload(updated) as OutboxAppendData, { tx: ctx, baseUpdatedAt: media.updatedAt });
      }
    });
  }

  async retry(id: string): Promise<void> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.tripMedia], async (ctx) => {
      await ctx.table<TripMedia>("tripMedia").update(id, {
        uploadStatus: "pending",
        uploadProgress: 0,
        uploadError: null,
        uploadAttempts: 0,
        nextUploadAt: null,
        updatedAt: new Date().toISOString(),
      });
      if (typeof window !== "undefined") window.dispatchEvent(new Event("viatik:sync-request"));
    });
  }
}

export function mediaPayload(media: TripMedia): Record<string, unknown> {
  return { id: media.id, tripId: media.tripId, activityId: media.activityId, caption: media.caption, storagePath: media.storagePath, contentType: media.contentType, byteSize: media.byteSize, createdBy: media.createdBy, createdAt: media.createdAt, updatedAt: media.updatedAt, deletedAt: media.deletedAt };
}

export const mediaRepository = new DexieMediaRepository();
