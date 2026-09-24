/**
 * Pure builders that turn domain entities into feed drafts (rich, self
 * contained human-readable summaries). Keeping these pure and side-effect
 * free makes the emission logic easy to unit test.
 */
import type { Activity, Expense } from "@/features/domain/entities";
import type { TripMedia } from "@/features/domain/entities-media";
import { formatMinorUnits } from "@/features/domain/money";
import { FEED_VERBS_BY_ENTITY } from "@/features/feed/domain/feed-types";
import type { FeedItemDraft, FeedVerb, TripFeedItem } from "@/features/feed/domain/feed-types";

/** Quote a short title/description for a summary sentence. */
function quote(value: string): string {
  return `“${value}”`;
}

const EMPTY_ACTIVITY_VERBS: Record<FeedVerb, string> = {
  added_activity: "",
  updated_activity: "",
  deleted_activity: "",
  restored_activity: "",
  completed_checklist_item: "",
  reopened_checklist_item: "",
  skipped_checklist_item: "",
  restored_checklist_item: "",
  deleted_checklist_item: "",
  added_expense: "",
  updated_expense: "",
  deleted_expense: "",
  uploaded_photo: "",
  updated_photo: "",
  deleted_photo: "",
};

/**
 * Activity feed builders. `actorId` is the member who performed the action;
 * for `create` this is the activity's `createdBy`, for edits/deletes it is
 * the id of the acting member when known (falls back to `createdBy`).
 */
export function buildActivityFeed(verb: FeedVerb, activity: Activity, actorId: string): FeedItemDraft {
  const title = activity.title.trim() || "activity";
  const summaryByVerb: Record<FeedVerb, string> = {
    ...EMPTY_ACTIVITY_VERBS,
    added_activity: `added ${quote(title)} to the itinerary`,
    updated_activity: `updated the activity ${quote(title)}`,
    deleted_activity: `removed the activity ${quote(title)}`,
    restored_activity: `restored the activity ${quote(title)}`,
  };
  return {
    tripId: activity.tripId,
    actorId,
    verb,
    entityType: "activity",
    entityId: activity.id,
    summary: summaryByVerb[verb],
    metadata: {
      title: activity.title,
      dayDate: activity.dayDate,
      category: activity.category,
      location: activity.location,
    },
  };
}

export type ChecklistFeedAction =
  | "completed_checklist_item"
  | "reopened_checklist_item"
  | "skipped_checklist_item"
  | "restored_checklist_item"
  | "deleted_checklist_item";

/** Feed entry for an on-the-go checklist mutation. */
export function buildChecklistItemFeed(
  verb: ChecklistFeedAction,
  activity: Activity,
  actorId: string,
  itemTitle: string,
): FeedItemDraft {
  const task = itemTitle.trim() || "a Must-do";
  const activityTitle = activity.title.trim() || "activity";
  const summaryByVerb: Record<ChecklistFeedAction, string> = {
    completed_checklist_item: `completed ${quote(task)} on ${quote(activityTitle)}`,
    reopened_checklist_item: `reopened ${quote(task)} on ${quote(activityTitle)}`,
    skipped_checklist_item: `skipped ${quote(task)} on ${quote(activityTitle)}`,
    restored_checklist_item: `restored ${quote(task)} on ${quote(activityTitle)}`,
    deleted_checklist_item: `deleted ${quote(task)} from ${quote(activityTitle)}`,
  };
  return {
    tripId: activity.tripId,
    actorId,
    verb,
    entityType: "activity",
    entityId: activity.id,
    summary: summaryByVerb[verb],
    metadata: {
      title: activity.title,
      dayDate: activity.dayDate,
      category: activity.category,
      checklistItemTitle: task,
    },
  };
}

/** Derive specific checklist events when a collaborator's Activity snapshot arrives. */
export function buildChecklistItemFeedChanges(
  previous: Activity,
  current: Activity,
  actorId: string,
): FeedItemDraft[] {
  const nextById = new Map((current.checklist ?? []).map((item) => [item.id, item]));
  return (previous.checklist ?? []).flatMap((oldItem) => {
    const nextItem = nextById.get(oldItem.id);
    let action: ChecklistFeedAction | null = null;

    if (!nextItem) {
      action = "deleted_checklist_item";
    } else if (oldItem.archived !== nextItem.archived) {
      action = nextItem.archived ? "skipped_checklist_item" : "restored_checklist_item";
    } else if (oldItem.completed !== nextItem.completed) {
      action = nextItem.completed ? "completed_checklist_item" : "reopened_checklist_item";
    }

    return action ? [buildChecklistItemFeed(action, current, actorId, oldItem.title)] : [];
  });
}

/** Expense feed builders. */
export function buildExpenseFeed(verb: FeedVerb, expense: Expense, actorId: string): FeedItemDraft {
  const description = expense.description.trim() || "expense";
  const amount = formatMinorUnits(expense.amountMinor, expense.currency);
  const summaryByVerb: Record<FeedVerb, string> = {
    ...EMPTY_ACTIVITY_VERBS,
    added_expense: `added expense ${quote(description)} for ${amount}`,
    updated_expense: `updated expense ${quote(description)}`,
    deleted_expense: `removed expense ${quote(description)}`,
  };
  return {
    tripId: expense.tripId,
    actorId,
    verb,
    entityType: "expense",
    entityId: expense.id,
    summary: summaryByVerb[verb],
    metadata: {
      description: expense.description,
      amountMinor: expense.amountMinor.toString(),
      currency: expense.currency,
      paidBy: expense.paidBy,
      date: expense.date,
    },
  };
}

/** Media (photo) feed builders. */
export function buildMediaFeed(verb: FeedVerb, media: TripMedia, actorId: string): FeedItemDraft {
  const summaryByVerb: Record<FeedVerb, string> = {
    ...EMPTY_ACTIVITY_VERBS,
    uploaded_photo: "uploaded a photo to the gallery",
    updated_photo: "updated a photo caption",
    deleted_photo: "removed a photo from the gallery",
  };
  return {
    tripId: media.tripId,
    actorId,
    verb,
    entityType: "media",
    entityId: media.id,
    summary: summaryByVerb[verb],
    metadata: {
      caption: media.caption,
      contentType: media.contentType,
      hasUploadedUrl: media.uploadedUrl != null,
    },
  };
}

/** Verify that a draft carries a non-empty summary and a valid verb for its type. */
export function isValidFeedDraft(draft: FeedItemDraft): boolean {
  if (!draft.summary.trim()) return false;
  return FEED_VERBS_BY_ENTITY[draft.entityType].includes(draft.verb);
}

/**
 * Materialize a draft into a persisted `TripFeedItem`, stamping a fresh id and
 * timestamp. Pure aside from randomness/time; the actual IndexedDB write is
 * performed by the repository so it can run inside a transaction.
 */
let lastFeedTimestamp = 0;

export function materializeFeedItem(draft: FeedItemDraft, now?: string): TripFeedItem {
  const createdAt = now ?? new Date(lastFeedTimestamp = Math.max(Date.now(), lastFeedTimestamp + 1)).toISOString();
  return {
    id: crypto.randomUUID(),
    tripId: draft.tripId,
    actorId: draft.actorId,
    verb: draft.verb,
    entityType: draft.entityType,
    entityId: draft.entityId,
    summary: draft.summary,
    metadata: draft.metadata,
    createdAt,
  };
}
