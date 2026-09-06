import { describe, expect, it } from "vitest";

import type { Activity, Expense } from "@/features/domain/entities";
import type { TripMedia } from "@/features/domain/entities-media";
import {
  buildActivityFeed,
  buildExpenseFeed,
  buildMediaFeed,
  isValidFeedDraft,
  materializeFeedItem,
} from "@/features/feed/lib/feed-builder";

const baseActivity: Activity = {
  id: "act-1",
  tripId: "trip-1",
  dayDate: "2026-06-01",
  title: "Hiking",
  description: null,
  location: "Mt. Fuji",
  category: "adventure",
  startTime: null,
  endTime: null,
  position: 1,
  estimatedCostMinor: null,
  createdBy: "user-a",
  createdAt: "2026-06-01T09:00:00.000Z",
  updatedAt: "2026-06-01T09:00:00.000Z",
  deletedAt: null,
};

const baseExpense: Expense = {
  id: "exp-1",
  tripId: "trip-1",
  activityId: null,
  description: "Lunch",
  amountMinor: 1250n,
  currency: "USD",
  exchangeRateToBase: null,
  paidBy: "user-a",
  splitType: "equal",
  categoryId: null,
  date: "2026-06-01",
  createdBy: "user-a",
  createdAt: "2026-06-01T12:00:00.000Z",
  updatedAt: "2026-06-01T12:00:00.000Z",
  deletedAt: null,
};

const baseMedia: TripMedia = {
  id: "media-1",
  tripId: "trip-1",
  activityId: null,
  caption: null,
  blob: null,
  storagePath: "trip-1/media-1.jpg",
  uploadedUrl: null,
  signedUrlExpiresAt: null,
  contentType: "image/jpeg",
  byteSize: 1024,
  createdBy: "user-b",
  uploadStatus: "pending",
  uploadProgress: 0,
  uploadError: null,
  uploadAttempts: 0,
  nextUploadAt: null,
  createdAt: "2026-06-02T10:00:00.000Z",
  updatedAt: "2026-06-02T10:00:00.000Z",
  deletedAt: null,
};

describe("buildActivityFeed", () => {
  it("builds a rich summary for each activity verb", () => {
    expect(buildActivityFeed("added_activity", baseActivity, "user-a").summary).toBe(
      "added “Hiking” to the itinerary"
    );
    expect(buildActivityFeed("updated_activity", baseActivity, "user-a").summary).toBe(
      "updated the activity “Hiking”"
    );
    expect(buildActivityFeed("deleted_activity", baseActivity, "user-a").summary).toBe(
      "removed the activity “Hiking”"
    );
    expect(buildActivityFeed("restored_activity", baseActivity, "user-a").summary).toBe(
      "restored the activity “Hiking”"
    );
  });

  it("carries entity metadata and actor", () => {
    const draft = buildActivityFeed("added_activity", baseActivity, "user-a");
    expect(draft.entityType).toBe("activity");
    expect(draft.entityId).toBe("act-1");
    expect(draft.tripId).toBe("trip-1");
    expect(draft.actorId).toBe("user-a");
    expect(draft.metadata.title).toBe("Hiking");
    expect(draft.metadata.dayDate).toBe("2026-06-01");
  });
});

describe("buildExpenseFeed", () => {
  it("includes the formatted amount for adds", () => {
    const draft = buildExpenseFeed("added_expense", baseExpense, "user-a");
    expect(draft.summary).toBe("added expense “Lunch” for $12.50");
  });

  it("builds update/delete summaries", () => {
    expect(buildExpenseFeed("updated_expense", baseExpense, "user-a").summary).toBe(
      "updated expense “Lunch”"
    );
    expect(buildExpenseFeed("deleted_expense", baseExpense, "user-a").summary).toBe(
      "removed expense “Lunch”"
    );
  });
});

describe("buildMediaFeed", () => {
  it("builds upload/update/delete summaries", () => {
    expect(buildMediaFeed("uploaded_photo", baseMedia, "user-b").summary).toBe(
      "uploaded a photo to the gallery"
    );
    expect(buildMediaFeed("updated_photo", baseMedia, "user-b").summary).toBe(
      "updated a photo caption"
    );
    expect(buildMediaFeed("deleted_photo", baseMedia, "user-b").summary).toBe(
      "removed a photo from the gallery"
    );
    expect(buildMediaFeed("uploaded_photo", baseMedia, "user-b").entityType).toBe("media");
  });
});

describe("isValidFeedDraft", () => {
  it("accepts a valid verb for its entity type", () => {
    expect(isValidFeedDraft(buildActivityFeed("added_activity", baseActivity, "u"))).toBe(true);
    expect(isValidFeedDraft(buildExpenseFeed("added_expense", baseExpense, "u"))).toBe(true);
    expect(isValidFeedDraft(buildMediaFeed("uploaded_photo", baseMedia, "u"))).toBe(true);
  });

  it("rejects a mismatched verb and an empty summary", () => {
    const mismatched = { ...buildActivityFeed("added_activity", baseActivity, "u"), verb: "added_expense" as const };
    expect(isValidFeedDraft(mismatched)).toBe(false);
    const empty = { ...buildActivityFeed("added_activity", baseActivity, "u"), summary: "  " };
    expect(isValidFeedDraft(empty)).toBe(false);
  });
});

describe("materializeFeedItem", () => {
  it("stamps an id and createdAt onto the draft", () => {
    const draft = buildExpenseFeed("added_expense", baseExpense, "user-a");
    const item = materializeFeedItem(draft, "2026-06-03T00:00:00.000Z");
    expect(item.id).toBeTruthy();
    expect(item.createdAt).toBe("2026-06-03T00:00:00.000Z");
    expect(item.summary).toBe(draft.summary);
    expect(item.actorId).toBe("user-a");
  });
});
