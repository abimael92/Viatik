"use client";

import { localizeThrownError } from "@/lib/i18n/localize-error";

import Link from "next/link";
import { Bell, CalendarDays, Check, CreditCard, Map, UserRound, Vote } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { contactRepository } from "@/features/contacts/data/dexie-contact-repository";
import { notificationRepository } from "@/features/notifications/data/dexie-notification-repository";
import { notificationBadgeCount } from "@/features/notifications/lib/notification-badge";
import { tripIdFromNotificationReference } from "@/features/trips/lib/return-pack-reminder";
import { notificationMessage } from "@/features/notifications/lib/notification-message";
import type { Notification, NotificationType } from "@/features/notifications/domain/notification-types";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { cn } from "@/lib/utils";

const icons = {
  friend_request: UserRound,
  vote_pending: Vote,
  settlement_pending: CreditCard,
  trip_alert: Map,
  trip_invitation: CalendarDays,
  trip_added: CalendarDays,
} as const;

const tones: Record<NotificationType, string> = {
  friend_request: "bg-viatik-magenta/15 text-viatik-magenta",
  vote_pending: "bg-viatik-blue/15 text-viatik-blue",
  settlement_pending: "bg-success/15 text-success",
  trip_alert: "bg-viatik-red/15 text-viatik-red",
  trip_invitation: "bg-primary/10 text-primary",
  trip_added: "bg-primary/10 text-primary",
};

export function NotificationBell({ userId }: { userId: string }) {
  const { t } = useI18n();
  const [count, setCount] = useState(0);
  useEffect(() => {
    let notifications: Notification[] = [];
    let inboundRequests: Array<{ connectionId: string | null }> = [];
    const publish = () => setCount(notificationBadgeCount(notifications, inboundRequests));
    const stopNotifications = notificationRepository.watch(userId, (items) => {
      notifications = items;
      publish();
    });
    const stopContacts = contactRepository.watch(userId, (contacts) => {
      inboundRequests = contacts.filter(
        (contact) => contact.connectionStatus === "pending" && contact.connectionDirection === "inbound",
      );
      publish();
    });
    return () => {
      stopNotifications();
      stopContacts();
    };
  }, [userId]);
  const label = count > 99 ? "99+" : String(count);
  return (
    <Link
      href="/notifications"
      aria-label={count ? t("copy.unreadNotifications", { count }) : t("copy.notificationsTitle")}
      className={cn(
        "relative grid size-11 place-items-center rounded-lg text-viatik-magenta transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-viatik-magenta",
        count > 0 ? "bg-viatik-magenta/20 hover:bg-viatik-magenta/30" : "hover:bg-side-hover",
      )}
    >
      <Bell className="size-5" aria-hidden />
      {count > 0 && (
        <span
          aria-hidden
          className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-viatik-red px-1 text-[10px] font-bold leading-none text-white ring-2 ring-side"
        >
          {label}
        </span>
      )}
    </Link>
  );
}

export function NotificationCenter({ userId }: { userId: string }) {
  const { t } = useI18n();
  const [items, setItems] = useState<Notification[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => notificationRepository.watch(userId, setItems), [userId]);

  async function markRead(item: Notification) {
    try {
      await notificationRepository.markRead(item.id);
    } catch (cause) {
      setError(localizeThrownError(cause, t, "copy.unableUpdateNotification"));
    }
  }

  async function markAllRead() {
    try {
      await notificationRepository.markAllRead(userId);
    } catch (cause) {
      setError(localizeThrownError(cause, t, "copy.unableUpdateNotifications"));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Heading level={1} className="text-3xl font-bold">
            {t("copy.notificationsTitle")}
          </Heading>
          <p className="mt-1 text-muted-foreground">{t("copy.notificationsDescription")}</p>
        </div>
        <Button
          variant="outline"
          onClick={() => void markAllRead()}
          disabled={!items.some((item) => !item.isRead)}
        >
          {t("copy.markAllRead")}
        </Button>
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="overflow-hidden rounded-2xl border bg-card">
        {items.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            <Bell className="mx-auto size-8 opacity-50" aria-hidden />
            <p className="mt-3">{t("copy.allCaughtUp")}</p>
          </div>
        ) : (
          <ul role="list" className="divide-y divide-border/60">
            {items.map((item) => (
              <NotificationRow key={item.id} item={item} onRead={() => void markRead(item)} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function NotificationRow({ item, onRead }: { item: Notification; onRead: () => void }) {
  const { t } = useI18n();
  const Icon = icons[item.type];
  const action =
    item.type === "friend_request" ? (
      <>
        <Button size="sm" variant="primary" onClick={onRead}>
          {t("common.accept")}
        </Button>
        <Button size="sm" variant="outline" onClick={onRead}>
          {t("common.decline")}
        </Button>
      </>
    ) : item.type === "vote_pending" ? (
      <Button size="sm" variant="primary" asChild>
        <Link href={`/trips/${item.referenceId}`} onClick={onRead}>
          {t("copy.voteNow")}
        </Link>
      </Button>
    ) : item.type === "settlement_pending" ? (
      <Button size="sm" variant="primary" onClick={onRead}>
        {t("copy.pay")}
      </Button>
    ) : item.type === "trip_invitation" ? (
      <Button size="sm" variant="outline" onClick={onRead}>
        {t("copy.viewInvitation")}
      </Button>
    ) : (
      <Button size="sm" variant="outline" asChild>
        <Link href={`/trips/${tripIdFromNotificationReference(item.referenceId)}`} onClick={onRead}>
          {t("copy.viewItineraryTitle")}
        </Link>
      </Button>
    );
  return (
    <li
      className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between ${!item.isRead ? "bg-primary/5" : ""}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", tones[item.type])}>
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{notificationMessage(item, t)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {new Date(item.createdAt).toLocaleString()}
          </p>
        </div>
        {!item.isRead && (
          <span className="size-2 shrink-0 rounded-full bg-viatik-red" aria-label={t("copy.unread")} />
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button size="sm" variant="ghost" aria-label={t("copy.markNotificationRead")} onClick={onRead}>
          <Check className="size-4" aria-hidden />
        </Button>
        {action}
      </div>
    </li>
  );
}
