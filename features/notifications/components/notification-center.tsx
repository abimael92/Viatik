"use client";

import { localizeThrownError } from "@/lib/i18n/localize-error";

import Link from "next/link";
import { Bell, CalendarDays, Check, CreditCard, Map, UserRound, Vote } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { notificationRepository } from "@/features/notifications/data/dexie-notification-repository";
import { notificationMessage } from "@/features/notifications/lib/notification-message";
import type { Notification } from "@/features/notifications/domain/notification-types";
import { useI18n } from "@/lib/i18n/i18n-provider";

const icons = {
  friend_request: UserRound,
  vote_pending: Vote,
  settlement_pending: CreditCard,
  trip_alert: Map,
  trip_invitation: CalendarDays,
  trip_added: CalendarDays,
} as const;

export function NotificationBell({ userId }: { userId: string }) {
  const { t } = useI18n();
  const [count, setCount] = useState(0);
  useEffect(() => notificationRepository.watchUnreadCount(userId, setCount), [userId]);
  return (
    <Link
      href="/notifications"
      aria-label={count ? t("copy.unreadNotifications", { count }) : t("copy.notificationsTitle")}
      className="relative grid size-11 place-items-center rounded-lg text-side-muted transition hover:bg-side-hover hover:text-side-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-viatik-magenta"
    >
      <Bell className="size-5" aria-hidden />
      {count > 0 && (
        <span
          aria-hidden
          className="absolute right-1 top-1 min-w-4 rounded-full bg-viatik-red px-1 text-center text-[10px] font-bold leading-4 text-white"
        >
          {count > 99 ? "99+" : count}
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
        <Link href={`/trips/${item.referenceId}`} onClick={onRead}>
          {t("copy.viewItineraryTitle")}
        </Link>
      </Button>
    );
  return (
    <li
      className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between ${!item.isRead ? "bg-primary/5" : ""}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
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
