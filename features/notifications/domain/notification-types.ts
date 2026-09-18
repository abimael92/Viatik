export const notificationTypes = ["vote_pending", "friend_request", "settlement_pending", "trip_alert"] as const;
export type NotificationType = (typeof notificationTypes)[number];

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  referenceId: string;
  isRead: boolean;
  pushSentAt: string | null;
  message: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}
