import type { Notification } from "@/features/notifications/domain/notification-types";

/** Unread notices plus inbound friend requests that are not already in that unread set. */
export function notificationBadgeCount(
  notifications: Array<Pick<Notification, "isRead" | "type" | "referenceId">>,
  inboundRequests: Array<{ connectionId: string | null }>,
): number {
  const unread = notifications.filter((item) => !item.isRead);
  const covered = new Set(
    unread.filter((item) => item.type === "friend_request").map((item) => item.referenceId),
  );
  const extraRequests = inboundRequests.filter(
    (request) => !request.connectionId || !covered.has(request.connectionId),
  ).length;
  return unread.length + extraRequests;
}
