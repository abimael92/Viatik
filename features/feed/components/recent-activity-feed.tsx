"use client";

import { Rss } from "lucide-react";

import { Heading } from "@/components/ui/heading";
import { FeedRow } from "@/features/feed/components/shared-trip-feed";
import { useRecentActivity } from "@/features/feed/lib/use-recent-activity";
import { cn } from "@/lib/utils";

/**
 * Aggregated "Recent activity" stream for the Trips library. Shows the newest
 * feed contributions across every trip (offline-first), distinct from the
 * single-trip feed used inside a trip workspace.
 */
export function RecentActivityFeed({
  userId,
  limit,
  className,
  emptyMessage = "No activity yet. Changes across your trips will appear here.",
}: {
  userId: string;
  limit?: number;
  className?: string;
  emptyMessage?: string;
}) {
  const { loading, items, profiles } = useRecentActivity(userId);
  const visible = limit ? items.slice(0, limit) : items;

  return (
    <section
      aria-labelledby="recent-activity-heading"
      className={cn("rounded-2xl border bg-card p-5 sm:p-6", className)}
    >
      <div className="flex items-center gap-2">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Rss className="size-4" aria-hidden />
        </span>
        <Heading level={2} id="recent-activity-heading" className="text-base font-semibold">
          Recent activity
        </Heading>
      </div>

      {loading ? (
        <div className="mt-4 space-y-3">
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
        <div className="mt-4 rounded-xl border border-dashed bg-linear-to-b from-card to-muted/30 p-8 text-center">
          <span className="mx-auto grid size-10 place-items-center rounded-full bg-primary/10 text-primary">
            <Rss className="size-5" aria-hidden />
          </span>
          <p className="mt-3 text-sm text-muted-foreground">{emptyMessage}</p>
        </div>
      ) : (
        <ol className="relative mt-4 space-y-1 border-l border-border pl-5">
          {visible.map((item) => (
            <li key={item.id} className="relative py-2.5">
              <span
                aria-hidden
                className="absolute -left-5.25 top-6 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary"
              />
              <FeedRow item={item} currentUserId={userId} profile={profiles.get(item.actorId)} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
