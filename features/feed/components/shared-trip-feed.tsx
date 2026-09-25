"use client";

import { Activity as ActivityIcon, Camera, ChevronDown, ChevronUp, CircleDollarSign, Rss } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { FeedEntityType, TripFeedItem } from "@/features/feed/domain/feed-types";
import { formatRelativeTime } from "@/features/feed/lib/feed-time";
import { useSharedTripFeed, type FeedActorProfile } from "@/features/feed/lib/use-shared-trip-feed";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { cn } from "@/lib/utils";

const ENTITY_STYLE: Record<
  FeedEntityType,
  { icon: typeof Camera; className: string }
> = {
  activity: { icon: ActivityIcon, className: "bg-primary/10 text-primary" },
  expense: { icon: CircleDollarSign, className: "bg-emerald-500/10 text-emerald-600" },
  settlement: { icon: CircleDollarSign, className: "bg-emerald-500/10 text-emerald-600" },
  media: { icon: Camera, className: "bg-viatik-magenta/10 text-viatik-magenta" },
};

/** Display label for a feed actor. Offline-first: we only know the current
 *  user's identity for sure, so others fall back to a short id fragment. */
export function resolveActorLabel(actorId: string, currentUserId: string): string {
  if (actorId === currentUserId) return "You";
  if (!actorId) return "A traveler";
  return `Traveler ${actorId.slice(0, 4)}`;
}

/**
 * Collaborative Real-Time Feed & Shared Trip Activity Stream. A chronological
 * (newest-first) log of member contributions — photo uploads, expense
 * additions, and activity changes — with author avatars, rich descriptions,
 * and relative timestamps. Reads entirely from the local Dexie feed store so
 * it works offline.
 */
export function SharedTripFeed({
  tripId,
  userId,
  limit,
  className,
  collapsible = false,
  heading,
  emptyMessage,
}: {
  tripId: string;
  userId: string;
  limit?: number;
  className?: string;
  collapsible?: boolean;
  heading?: string;
  emptyMessage?: string;
}) {
  const { t } = useI18n();
  const resolvedHeading = heading ?? "Trip Feed";
  const resolvedEmpty = emptyMessage ?? "No activity yet. Add a photo, expense, or activity to kick things off.";
  const { loading, items, profiles } = useSharedTripFeed(tripId, userId);
  const [isExpanded, setIsExpanded] = useState(!collapsible);
  const contentId = useId();
  const visible = limit ? items.slice(0, limit) : items;

  return (
    <section aria-labelledby="feed-heading" className={cn("space-y-5", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Rss className="size-5" aria-hidden />
          </span>
          <div>
            <Heading level={2} id="feed-heading" className="text-xl font-bold">
              {resolvedHeading}
            </Heading>
            <p className="text-sm text-muted-foreground">
              {t("copy.feedHeading")}
            </p>
          </div>
        </div>
        {collapsible && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={isExpanded}
            aria-controls={contentId}
            aria-label={`${isExpanded ? "Collapse" : "Expand"} trip feed`}
            onClick={() => setIsExpanded((expanded) => !expanded)}
          >
            {isExpanded ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
          </Button>
        )}
      </div>

      {(!collapsible || isExpanded) && <div id={contentId}>
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="flex items-center gap-3 rounded-xl border bg-card p-4">
              <div className="size-9 animate-pulse rounded-full bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
                <div className="h-2.5 w-1/3 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-linear-to-b from-card to-muted/30 p-10 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
            <Rss className="size-6" aria-hidden />
          </span>
          <Heading level={3} className="mt-4 text-base font-semibold">
            {t("copy.noActivityYet")}
          </Heading>
          <p className="mt-1 text-sm text-muted-foreground">{resolvedEmpty}</p>
        </div>
      ) : (
        <ol className="relative space-y-1 border-l border-border pl-5">
          {visible.map((item) => (
            <li key={item.id} className="relative py-3">
              <span
                aria-hidden
                className="absolute -left-5.25 top-6 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary"
              />
              <FeedRow item={item} currentUserId={userId} profile={profiles.get(item.actorId)} />
            </li>
          ))}
        </ol>
      )}
      </div>}
    </section>
  );
}

export function FeedRow({ item, currentUserId, profile }: { item: TripFeedItem; currentUserId: string; profile?: FeedActorProfile }) {
  const { t } = useI18n();
  const style = ENTITY_STYLE[item.entityType] ?? ENTITY_STYLE.activity;
  const Icon = style.icon;
  const actorLabel = item.actorId === currentUserId ? t("common.you") : profile?.name ?? resolveActorLabel(item.actorId, currentUserId);

  return (
    <div className="flex items-start gap-3">
      <UserAvatar seed={profile?.avatarSeed ?? (item.actorId === currentUserId ? undefined : item.actorId)} src={profile?.avatarUrl} name={actorLabel} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug text-foreground">
          <span className="font-semibold">
            {actorLabel}
          </span>{" "}
          <span className="text-muted-foreground">{item.summary}</span>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          <time dateTime={item.createdAt}>{formatRelativeTime(item.createdAt)}</time>
        </p>
      </div>
      <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg", style.className)}>
        <Icon className="size-4" aria-hidden />
      </span>
    </div>
  );
}
