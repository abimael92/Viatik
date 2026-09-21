"use client";

import Link from "next/link";
import { Bell, CalendarDays, Check, CreditCard, Map, UserRound, Vote } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { notificationRepository } from "@/features/notifications/data/dexie-notification-repository";
import type { Notification } from "@/features/notifications/domain/notification-types";

const icons = {
  friend_request: UserRound,
  vote_pending: Vote,
  settlement_pending: CreditCard,
  trip_alert: Map,
  trip_invitation: CalendarDays,
} as const;

export function NotificationBell({ userId }: { userId: string }) {
  const [count, setCount] = useState(0);
  useEffect(() => notificationRepository.watchUnreadCount(userId, setCount), [userId]);
  return (
    <Link
      href="/notifications"
      aria-label={count ? `${count} unread notifications` : "Notifications"}
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
  const [items, setItems] = useState<Notification[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => notificationRepository.watch(userId, setItems), [userId]);

  async function markRead(item: Notification) {
    try {
      await notificationRepository.markRead(item.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update notification.");
    }
  }

  async function markAllRead() {
    try {
      await notificationRepository.markAllRead(userId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update notifications.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Heading level={1} className="text-3xl font-bold">
            Notifications
          </Heading>
          <p className="mt-1 text-muted-foreground">
            Stay on top of trip decisions, connections, and shared expenses.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => void markAllRead()}
          disabled={!items.some((item) => !item.isRead)}
        >
          Mark all as read
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
            <p className="mt-3">You’re all caught up.</p>
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
  const Icon = icons[item.type];
  const action =
    item.type === "friend_request" ? (
      <>
        <Button size="sm" variant="primary" onClick={onRead}>
          Accept
        </Button>
        <Button size="sm" variant="outline" onClick={onRead}>
          Decline
        </Button>
      </>
    ) : item.type === "vote_pending" ? (
      <Button size="sm" variant="primary" asChild>
        <Link href={`/trips/${item.referenceId}`} onClick={onRead}>
          Vote Now
        </Link>
      </Button>
    ) : item.type === "settlement_pending" ? (
      <Button size="sm" variant="primary" onClick={onRead}>
        Pay
      </Button>
    ) : item.type === "trip_invitation" ? (
      <Button size="sm" variant="outline" onClick={onRead}>
        View invitation
      </Button>
    ) : (
      <Button size="sm" variant="outline" asChild>
        <Link href={`/trips/${item.referenceId}`} onClick={onRead}>
          View Itinerary
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
          <p className="truncate text-sm font-medium">{item.message}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {new Date(item.createdAt).toLocaleString()}
          </p>
        </div>
        {!item.isRead && (
          <span className="size-2 shrink-0 rounded-full bg-viatik-red" aria-label="Unread" />
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button size="sm" variant="ghost" aria-label="Mark notification as read" onClick={onRead}>
          <Check className="size-4" aria-hidden />
        </Button>
        {action}
      </div>
    </li>
  );
}
