import { liveQuery } from "dexie";

import type { Notification, NotificationType } from "@/features/notifications/domain/notification-types";
import { getCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { TransactionContext } from "@/lib/db/transaction-context";

function db(): ViatikDatabase {
  const current = getCurrentDatabase();
  if (!current) throw new Error("No database is open. Wrap calls in DatabaseProvider.");
  return current;
}

export class DexieNotificationRepository {
  list(userId: string): Promise<Notification[]> {
    return db().notifications.where("userId").equals(userId).reverse().sortBy("createdAt");
  }

  watch(userId: string, onChange: (items: Notification[]) => void): () => void {
    const subscription = liveQuery(() => this.list(userId)).subscribe({ next: onChange });
    return () => subscription.unsubscribe();
  }

  watchUnreadCount(userId: string, onChange: (count: number) => void): () => void {
    const subscription = liveQuery(() => db().notifications.where("userId").equals(userId).filter((item) => !item.isRead).count()).subscribe({ next: onChange });
    return () => subscription.unsubscribe();
  }

  async create(input: { id?: string; userId: string; type: NotificationType; referenceId: string; message: string }): Promise<Notification> {
    const now = new Date().toISOString();
    const item: Notification = { id: input.id ?? crypto.randomUUID(), userId: input.userId, type: input.type, referenceId: input.referenceId, isRead: false, message: input.message.trim(), createdAt: now, updatedAt: now, version: 1 };
    return TransactionContext.runInTransaction([db().notifications], async (tx) => {
      await tx.table<Notification>("notifications").put(item);
      return item;
    });
  }

  async markRead(id: string): Promise<void> {
    const current = await db().notifications.get(id);
    if (!current || current.isRead) return;
    const updated = { ...current, isRead: true, version: current.version + 1, updatedAt: new Date().toISOString() };
    await TransactionContext.runInTransaction([db().notifications], async (tx) => {
      await tx.table<Notification>("notifications").put(updated);
    });
  }
}

export const notificationRepository = new DexieNotificationRepository();
