/**
 * Shared Trip Activity Feed domain types.
 *
 * Feed items are a local, chronological log of group member contributions
 * (photo uploads, expense additions, activity changes). They are derived
 * from the already-synced domain entities (expenses, media, activities), so
 * the store is device-local — exactly like `profiles` and `tripPins` — and is
 * intentionally excluded from cloud sync / the outbox.
 */

/** What happened. Used to pick icons and to format fallback summaries. */
export type FeedVerb =
  | "added_expense"
  | "updated_expense"
  | "deleted_expense"
  | "uploaded_photo"
  | "updated_photo"
  | "deleted_photo"
  | "added_activity"
  | "updated_activity"
  | "deleted_activity"
  | "restored_activity";

/** Which kind of entity the feed entry refers to. */
export type FeedEntityType = "expense" | "media" | "activity";

/** The set of verbs that are legal for each entity type. */
export const FEED_VERBS_BY_ENTITY: Record<FeedEntityType, ReadonlyArray<FeedVerb>> = {
  expense: ["added_expense", "updated_expense", "deleted_expense"],
  media: ["uploaded_photo", "updated_photo", "deleted_photo"],
  activity: ["added_activity", "updated_activity", "deleted_activity", "restored_activity"],
};

/**
 * A single activity feed entry. The `summary` is a self-contained, human
 * readable sentence (e.g. `added expense “Lunch” for $12.50`) so it renders
 * correctly offline with no further lookups. `metadata` carries structured
 * context (title, amount, day, caption) for richer rendering / future use.
 */
export interface TripFeedItem {
  id: string;
  tripId: string;
  /** The id of the member who performed the action. */
  actorId: string;
  verb: FeedVerb;
  entityType: FeedEntityType;
  entityId: string;
  summary: string;
  metadata: Record<string, unknown>;
  /** ISO datetime — the feed is ordered by this (newest first). */
  createdAt: string;
}

/** A not-yet-persisted feed entry (as produced by the pure builders). */
export interface FeedItemDraft {
  tripId: string;
  actorId: string;
  verb: FeedVerb;
  entityType: FeedEntityType;
  entityId: string;
  summary: string;
  metadata: Record<string, unknown>;
}
