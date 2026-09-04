"use client";

import { LoaderCircle, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { syncNow } from "@/lib/sync/sync-engine";
import { useSyncStatus } from "@/lib/sync/use-sync-status";
import { cn } from "@/lib/utils";

/**
 * Optimistic, local-first sync status pill. Always reflects the device's
 * offline-ready state with a pulsing dot, an animated spinner while syncing,
 * and a live pending counter. Renders as a quiet pill; clicking it (when
 * applicable) triggers an immediate re-sync.
 */
export function SyncStatusPill({ compact = false }: { compact?: boolean }) {
  const sync = useSyncStatus();

  const offline = !sync.isOnline;

  if (offline) {
    return (
      <Badge variant="success" className="text-[11px]">
        <StatusDot tone="success" pulse />
        {compact ? "Offline ready" : "Offline ready · Saved locally"}
      </Badge>
    );
  }

  if (sync.status === "syncing") {
    return (
      <Badge variant="muted" className="text-[11px]">
        <LoaderCircle className="size-3 animate-spin text-primary" />
        {compact ? "Syncing" : "Syncing to cloud"}
      </Badge>
    );
  }

  if (sync.status === "error") {
    return (
      <button
        type="button"
        onClick={() => void syncNow()}
        title="Some changes could not sync — retry"
        className={cn(
          "inline-flex min-h-11 min-w-11 items-center rounded-full",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        )}
      >
        <Badge variant="warning" className="text-[11px]">
          <StatusDot tone="warning" pulse />
          {compact ? "Attention" : "Sync needs attention"}
          <RefreshCw className="size-3" aria-hidden />
        </Badge>
      </button>
    );
  }

  if (sync.pending > 0) {
    return (
      <Badge variant="outline" className="text-[11px]">
        <span className="grid min-h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
          {sync.pending}
        </span>
        {compact ? "pending" : "changes waiting to sync"}
      </Badge>
    );
  }

  return (
    <Badge variant="success" className="text-[11px]">
      <StatusDot tone="success" pulse />
      {compact ? "Synced" : "Synced · up to date"}
    </Badge>
  );
}

function StatusDot({ tone, pulse }: { tone: "success" | "warning"; pulse?: boolean }) {
  return (
    <span className="relative flex size-2 shrink-0" aria-hidden>
      {pulse && (
        <span
          className={cn(
            "absolute inline-flex h-full w-full animate-ping rounded-full opacity-60",
            tone === "success" ? "bg-success" : "bg-accent"
          )}
        />
      )}
      <span
        className={cn(
          "relative inline-flex size-2 rounded-full",
          tone === "success" ? "bg-success" : "bg-accent"
        )}
      />
    </span>
  );
}
