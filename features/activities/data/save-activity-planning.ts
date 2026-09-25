import { getCurrentDatabase } from "@/lib/db/dexie";
import { TransactionContext } from "@/lib/db/transaction-context";
import type { Activity } from "@/features/domain/entities";
import type { TripMedia } from "@/features/domain/entities-media";
import type { NewActivity } from "@/features/domain/repositories/activity-repository";
import {
  normalizeActivityAttachments,
  referencedActivityMediaIds,
  type PendingActivityImage,
} from "@/features/activities/domain/activity-attachments";
import { normalizeActivityCategory } from "@/features/activities/domain/activity-category";
import { normalizeActivityChecklist } from "@/features/activities/domain/activity-checklist";
import { emitFeedItem } from "@/features/feed/data/dexie-feed-repository";
import { buildActivityFeed, materializeFeedItem } from "@/features/feed/lib/feed-builder";
import { mediaPayload } from "@/features/media/data/dexie-media-repository";
import { append, type OutboxAppendData } from "@/lib/sync/outbox-transactional";
import { getSyncUser } from "@/lib/sync/sync-context";
import { logger } from "@/lib/observability/logger";

function getDb() {
  const db = getCurrentDatabase();
  if (!db) throw new Error("No database is open. Wrap calls in DatabaseProvider.");
  return db;
}

function pendingMediaRecord(
  input: PendingActivityImage,
  tripId: string,
  activityId: string,
  createdBy: string,
  now: string,
): TripMedia {
  const extension = input.blob.type === "image/png" ? "png" : input.blob.type === "image/webp" ? "webp" : "jpg";
  return {
    id: input.id,
    tripId,
    activityId,
    caption: input.caption ?? null,
    takenAt: null,
    blob: input.blob,
    storagePath: `${tripId}/${input.id}.${extension}`,
    uploadedUrl: null,
    signedUrlExpiresAt: null,
    contentType: input.blob.type || "image/jpeg",
    byteSize: input.blob.size,
    createdBy,
    updatedBy: createdBy,
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
}

export async function saveActivityPlanning(input: {
  existing?: Activity | null;
  activity: NewActivity;
  pendingImages?: PendingActivityImage[];
}): Promise<Activity> {
  const db = getDb();
  const pendingImages = input.pendingImages ?? [];
  return TransactionContext.runInTransaction([db.activities, db.tripMedia, db.feedItems], async (ctx) => {
    const now = new Date().toISOString();
    const actorId = getSyncUser() ?? input.activity.createdBy;
    const attachments = normalizeActivityAttachments(input.activity.attachments);
    const nextReferenced = new Set(referencedActivityMediaIds(attachments));

    for (const pending of pendingImages) {
      if (!nextReferenced.has(pending.id)) continue;
      const existingMedia = await ctx.table<TripMedia>("tripMedia").get(pending.id);
      if (existingMedia) continue;
      await ctx.table<TripMedia>("tripMedia").add(
        pendingMediaRecord(pending, input.activity.tripId, input.activity.id, actorId, now),
      );
    }

    let saved: Activity;
    if (input.existing) {
      const previousReferenced = referencedActivityMediaIds(input.existing.attachments);
      for (const mediaId of previousReferenced) {
        if (nextReferenced.has(mediaId)) continue;
        const media = await ctx.table<TripMedia>("tripMedia").get(mediaId);
        if (!media || media.deletedAt) continue;
        const deletedAt = now;
        const deleted = {
          ...media,
          deletedAt,
          updatedAt: deletedAt,
          deletedBy: actorId,
          updatedBy: actorId,
        };
        await ctx.table<TripMedia>("tripMedia").put(deleted);
        if (media.uploadStatus === "uploaded") {
          await append("media", "update", mediaPayload(deleted) as OutboxAppendData, {
            tx: ctx,
            baseUpdatedAt: media.updatedAt,
          });
        }
      }

      const nextPatch = {
        ...input.activity,
        category: normalizeActivityCategory(input.activity.category),
        attachments,
        checklist: normalizeActivityChecklist(input.activity.checklist),
        updatedBy: actorId,
        version: (input.existing.version ?? 1) + 1,
        updatedAt: now,
      };
      await ctx.table<Activity>("activities").update(input.existing.id, nextPatch);
      const activity = await ctx.table<Activity>("activities").get(input.existing.id);
      if (!activity) throw new Error(`Activity ${input.existing.id} not found after update`);
      await append("activity", "update", activity, { tx: ctx, baseUpdatedAt: input.existing.updatedAt });
      await emitFeedItem(ctx, materializeFeedItem(buildActivityFeed("updated_activity", activity, actorId)));
      saved = activity;
    } else {
      saved = {
        id: input.activity.id,
        tripId: input.activity.tripId,
        dayDate: input.activity.dayDate,
        title: input.activity.title,
        description: input.activity.description ?? null,
        placeName: input.activity.placeName ?? null,
        formattedAddress: input.activity.formattedAddress ?? null,
        placeId: input.activity.placeId ?? null,
        category: normalizeActivityCategory(input.activity.category),
        timingSpecificity: input.activity.timingSpecificity ?? "exact",
        flexiblePeriod: input.activity.timingSpecificity === "flexible" ? input.activity.flexiblePeriod ?? "anytime" : null,
        startTime: input.activity.startTime ?? null,
        endTime: input.activity.endTime ?? null,
        bookingReference: input.activity.bookingReference?.trim() || null,
        participants: input.activity.participants ?? [],
        pollStatus: input.activity.pollStatus ?? "confirmed",
        votingEndsAt: input.activity.votingEndsAt ?? null,
        pollOptions: input.activity.pollOptions ?? [],
        pollVotes: input.activity.pollVotes ?? [],
        attachments,
        checklist: normalizeActivityChecklist(input.activity.checklist),
        position: input.activity.position,
        estimatedCostMinor: input.activity.estimatedCostMinor ?? null,
        createdBy: actorId,
        updatedBy: actorId,
        deletedBy: null,
        version: 1,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      await ctx.table<Activity>("activities").add(saved);
      await append("activity", "insert", saved, { tx: ctx, baseUpdatedAt: null });
      await emitFeedItem(ctx, materializeFeedItem(buildActivityFeed("added_activity", saved, actorId)));
    }

    if (typeof window !== "undefined") window.dispatchEvent(new Event("viatik:sync-request"));
    logger.debug("Activity planning saved locally", { activityId: saved.id });
    return saved;
  });
}
