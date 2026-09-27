import { describe, expect, it } from "vitest";

import { notificationBadgeCount } from "@/features/notifications/lib/notification-badge";

describe("notificationBadgeCount", () => {
  it("counts an inbound friend request once when a matching unread notice already exists", () => {
    expect(
      notificationBadgeCount(
        [{ isRead: false, type: "friend_request", referenceId: "conn-1" }],
        [{ connectionId: "conn-1" }],
      ),
    ).toBe(1);
  });

  it("still counts a pending friend request that has no notification row", () => {
    expect(
      notificationBadgeCount(
        [{ isRead: false, type: "trip_added", referenceId: "trip-1" }],
        [{ connectionId: "conn-2" }],
      ),
    ).toBe(2);
  });

  it("counts a pending request again after its notice was marked read", () => {
    expect(
      notificationBadgeCount(
        [{ isRead: true, type: "friend_request", referenceId: "conn-1" }],
        [{ connectionId: "conn-1" }],
      ),
    ).toBe(1);
  });
});
