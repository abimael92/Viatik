import { liveQuery } from "dexie";

import type { StagedTripMedia } from "@/features/domain/entities-staged-media";
import type { TripMedia } from "@/features/domain/entities-media";
import { buildMediaFeed, materializeFeedItem } from "@/features/feed/lib/feed-builder";
import { emitFeedItem } from "@/features/feed/data/dexie-feed-repository";
import { getCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { TransactionContext } from "@/lib/db/transaction-context";
import { append, type OutboxAppendData } from "@/lib/sync/outbox-transactional";
import { getSyncUser } from "@/lib/sync/sync-context";
import { mediaPayload } from "@/features/media/data/dexie-media-repository";

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);

function getDb(): ViatikDatabase {
  const db = getCurrentDatabase();
  if (!db) throw new Error("No database is open. Wrap calls in DatabaseProvider.");
  return db;
}

async function assertCurrentMember(db: ViatikDatabase, tripId: string, userId: string): Promise<void> {
  const trip = await db.trips.get(tripId);
  if (trip?.ownerId === userId && trip.deletedAt === null) return;
  const member = await db.tripMembers.where("[tripId+userId]").equals([tripId, userId]).first();
  if (!member || member.removedAt !== null) throw new Error("Only a current trip member can contribute photos.");
}

function makeSharedMedia(draft: StagedTripMedia, now: string, existing?: TripMedia): TripMedia {
  const extension = draft.contentType === "image/png" ? "png" : draft.contentType === "image/webp" ? "webp" : draft.contentType === "image/heic" ? "heic" : "jpg";
  return {
    id: draft.id,
    tripId: draft.tripId,
    activityId: draft.activityId,
    kind: "photo",
    publicGallery: false,
    durationMs: null,
    caption: draft.caption,
    takenAt: draft.takenAt,
    blob: draft.blob,
    storagePath: `${draft.tripId}/${draft.id}.${extension}`,
    uploadedUrl: null,
    signedUrlExpiresAt: null,
    contentType: draft.contentType,
    byteSize: draft.byteSize,
    createdBy: draft.createdBy,
    updatedBy: draft.createdBy,
    deletedBy: null,
    restoredAt: existing ? now : null,
    restoredBy: existing ? draft.createdBy : null,
    version: (existing?.version ?? 0) + 1,
    uploadStatus: "pending",
    uploadProgress: 0,
    uploadError: null,
    uploadAttempts: 0,
    nextUploadAt: null,
    createdAt: existing?.createdAt ?? draft.createdAt,
    updatedAt: now,
    deletedAt: null,
  };
}

export class StagedTripMediaRepository {
  async stage(input: Omit<StagedTripMedia, "activityId" | "contentType" | "byteSize" | "createdAt"> & { activityId?: string | null }): Promise<StagedTripMedia> {
    const db = getDb();
    const userId = getSyncUser();
    if (!userId || input.createdBy !== userId) throw new Error("A signed-in member must stage their own photo.");
    await assertCurrentMember(db, input.tripId, userId);
    if (!ALLOWED_PHOTO_TYPES.has(input.blob.type) || input.blob.size === 0 || input.blob.size > MAX_PHOTO_BYTES) {
      throw new Error("Photo must be a supported image up to 10 MB.");
    }
    const staged: StagedTripMedia = {
      ...input,
      activityId: input.activityId ?? null,
      contentType: input.blob.type,
      byteSize: input.blob.size,
      createdAt: new Date().toISOString(),
    };
    await db.stagedTripMedia.put(staged);
    return staged;
  }

  listByTrip(tripId: string): Promise<StagedTripMedia[]> {
    return getDb().stagedTripMedia.where("tripId").equals(tripId).sortBy("createdAt");
  }

  watchByTrip(tripId: string, onChange: (media: StagedTripMedia[]) => void): () => void {
    const subscription = liveQuery(() => this.listByTrip(tripId)).subscribe({ next: onChange });
    return () => subscription.unsubscribe();
  }

  async discard(id: string): Promise<void> {
    const db = getDb();
    const existing = await db.stagedTripMedia.get(id);
    if (!existing) return;
    if (existing.createdBy !== getSyncUser()) throw new Error("Only the contributor can discard this draft.");
    await db.stagedTripMedia.delete(id);
  }

  async share(ids: string[]): Promise<TripMedia[]> {
    if (!ids.length) return [];
    const db = getDb();
    const userId = getSyncUser();
    if (!userId) throw new Error("Sign in before sharing photos.");
    const selectedIds = [...new Set(ids)];
    const shared = await TransactionContext.runInTransaction(
      [db.stagedTripMedia, db.tripMedia, db.feedItems, db.trips, db.tripMembers],
      async (ctx) => {
        const now = new Date().toISOString();
        const results: TripMedia[] = [];
        for (const id of selectedIds) {
          const draft = await ctx.table<StagedTripMedia>("stagedTripMedia").get(id);
          if (!draft) throw new Error("A selected photo draft is no longer available.");
          if (draft.createdBy !== userId) throw new Error("Only the contributor can share this draft.");
          await assertCurrentMember(db, draft.tripId, userId);
          const existing = await ctx.table<TripMedia>("tripMedia").get(id);
          if (existing && existing.deletedAt === null) throw new Error("This photo is already shared.");
          const media = makeSharedMedia(draft, now, existing);
          await ctx.table<TripMedia>("tripMedia").put(media);
          if (existing) {
            await append("media", "update", mediaPayload(media) as OutboxAppendData, {
              tx: ctx,
              baseUpdatedAt: existing.uploadStatus === "uploaded" ? existing.updatedAt : null,
            });
          }
          await emitFeedItem(ctx, materializeFeedItem(buildMediaFeed("uploaded_photo", media, userId)));
          await ctx.table<StagedTripMedia>("stagedTripMedia").delete(id);
          results.push(media);
        }
        return results;
      },
    );
    if (typeof window !== "undefined") window.dispatchEvent(new Event("viatik:sync-request"));
    return shared;
  }

  async unshare(id: string): Promise<void> {
    const db = getDb();
    const userId = getSyncUser();
    if (!userId) throw new Error("Sign in before unsharing photos.");
    await TransactionContext.runInTransaction(
      [db.stagedTripMedia, db.tripMedia, db.feedItems, db.trips, db.tripMembers],
      async (ctx) => {
        const media = await ctx.table<TripMedia>("tripMedia").get(id);
        if (!media || media.kind !== "photo" || media.deletedAt !== null) throw new Error("Shared photo not found.");
        if (media.createdBy !== userId) throw new Error("Only the photo contributor can unshare it.");
        await assertCurrentMember(db, media.tripId, userId);
        if (!media.blob) throw new Error("The contributor's local photo is unavailable; unsharing was cancelled.");
        const now = new Date().toISOString();
        const staged: StagedTripMedia = {
          id: media.id,
          tripId: media.tripId,
          activityId: media.activityId,
          caption: media.caption,
          takenAt: media.takenAt ?? null,
          blob: media.blob,
          contentType: media.contentType,
          byteSize: media.blob.size,
          createdBy: media.createdBy,
          createdAt: now,
        };
        const tombstone: TripMedia = {
          ...media,
          blob: null,
          deletedAt: now,
          deletedBy: userId,
          updatedBy: userId,
          updatedAt: now,
          version: media.version + 1,
          uploadStatus: media.uploadStatus === "uploaded" ? "uploaded" : "failed",
          uploadProgress: 0,
          uploadError: null,
          nextUploadAt: null,
        };
        await ctx.table<StagedTripMedia>("stagedTripMedia").put(staged);
        await ctx.table<TripMedia>("tripMedia").put(tombstone);
        await emitFeedItem(ctx, materializeFeedItem(buildMediaFeed("deleted_photo", tombstone, userId)));
        await append("media", media.uploadStatus === "uploaded" ? "update" : "insert", mediaPayload(tombstone) as OutboxAppendData, {
          tx: ctx,
          baseUpdatedAt: media.uploadStatus === "uploaded" ? media.updatedAt : null,
        });
      },
    );
  }

  async purgeTrip(tripId: string): Promise<void> {
    await getDb().stagedTripMedia.where("tripId").equals(tripId).delete();
  }
}

export const stagedTripMediaRepository = new StagedTripMediaRepository();
