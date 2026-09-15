"use client";

import { AlertTriangle, LoaderCircle, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { liveQuery } from "dexie";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDatabase } from "@/lib/db/database-provider";
import { syncNow } from "@/lib/sync/sync-engine";
import type { OutboxMutation } from "@/lib/sync/types";
import { useSyncStatus } from "@/lib/sync/use-sync-status";
import { cn } from "@/lib/utils";

/**
 * Interactive sync status pill. Shows the offline-ready state, a glowing
 * pulse while changes are pending, and — when there is a live local queue,
 * an error, or unresolved conflicts — opens a dropdown exposing the outbox
 * with a manual retry so the user can push pending mutations on demand.
 */
export function SyncStatusPill({ compact = false }: { compact?: boolean }) {
  const sync = useSyncStatus();
  const db = useDatabase();
  const triggerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [triggerRect, setTriggerRect] = useState<DOMRect | null>(null);
  const [queue, setQueue] = useState<OutboxMutation[]>([]);

  // Measure the trigger so the dropdown can be rendered fixed (via a portal)
  // near it, since the sidebar clips absolutely-positioned children.
  useEffect(() => {
    if (!open) return;
    const el = triggerRef.current;
    if (el) setTriggerRect(el.getBoundingClientRect());
  }, [open]);

  useEffect(() => {
    const sub = liveQuery(() => db.outboxMutations.toArray()).subscribe({
      next: setQueue,
      error: () => setQueue([]),
    });
    return () => sub.unsubscribe();
  }, [db]);

  const offline = !sync.isOnline;
  const interactive =
    offline || sync.status === "error" || sync.conflicts > 0 || sync.pending > 0 || queue.length > 0;

  function renderPill() {
    if (offline) {
      return (
        <Badge variant="success">
          <StatusDot tone="success" pulse />
          {compact ? "Offline ready" : "Offline ready · Saved locally"}
        </Badge>
      );
    }
    if (sync.status === "syncing") {
      return (
        <Badge variant="muted">
          <LoaderCircle className="size-3 animate-spin text-primary" />
          {compact ? "Syncing" : "Syncing to cloud"}
        </Badge>
      );
    }
    if (sync.status === "error") {
      return (
        <Badge variant="warning">
          <StatusDot tone="warning" pulse />
          {compact ? "Attention" : "Sync needs attention"}
          <RefreshCw className="size-3" aria-hidden />
        </Badge>
      );
    }
    if (sync.pending > 0) {
      return (
        <Badge variant="outline">
          <span className="grid min-h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground animate-pulse">
            {sync.pending}
          </span>
          {compact ? "pending" : "changes waiting"}
        </Badge>
      );
    }
    if (sync.conflicts > 0) {
      return (
        <Badge variant="warning">
          <StatusDot tone="warning" pulse />
          {compact ? `${sync.conflicts} conflict` : `${sync.conflicts} conflicts to resolve`}
        </Badge>
      );
    }
    return (
      <Badge variant="success">
        <StatusDot tone="success" />
        {compact ? "Synced" : "Synced · up to date"}
      </Badge>
    );
  }

  return (
    <div className="relative" ref={triggerRef}>
      <button
        type="button"
        onClick={() => interactive && setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          !interactive && "cursor-default"
        )}
      >
        {renderPill()}
      </button>

      {/* Portaled to <body> so the overlay + dropdown aren't clipped by the
          sidebar's overflow-hidden / backdrop-blur. */}
      {open && createPortal(
        <button type="button" aria-label="Close sync panel" className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />,
        document.body
      )}
      {open && triggerRect && createPortal(
        <div
          role="menu"
          style={{
            position: "fixed",
            top: triggerRect.bottom + 8,
            left: Math.min(triggerRect.left, Math.max(8, (typeof window !== "undefined" ? window.innerWidth : 1024) - 288 - 8)),
            zIndex: 50,
            width: "18rem",
          }}
          className="overflow-hidden rounded-xl border border-white/10 bg-black/80 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),0_24px_50px_-12px_rgba(0,0,0,0.6)] backdrop-blur-xl"
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-widest text-white/50">Sync queue</p>
            <Badge variant="outline" className="!text-[11px]">{queue.length}</Badge>
          </div>

          <div className="max-h-56 overflow-y-auto">
            {queue.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-white/40">Queue is clear — everything is up to date.</p>
            ) : (
              <ul className="divide-y divide-white/5 px-2 py-1">
                {queue.slice(0, 8).map((mutation) => (
                  <li key={mutation.id} className="flex items-center gap-2 px-2 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-white/80">{mutation.entityType}</span>
                      <span className="block text-[11px] uppercase tracking-widest text-white/35">
                        {mutation.operation} · {mutation.attempts} attempt{mutation.attempts === 1 ? "" : "s"}
                      </span>
                    </span>
                    {mutation.lastError && (
                      <AlertTriangle className="size-3.5 shrink-0 text-accent" aria-label="Error" />
                    )}
                  </li>
                ))}
                {queue.length > 8 && (
                  <li className="px-2 py-1.5 text-center text-[11px] uppercase tracking-widest text-white/35">
                    + {queue.length - 8} more
                  </li>
                )}
              </ul>
            )}
          </div>

          <div className="border-t border-white/10 p-2">
            <Button size="sm" variant="primary" className="w-full" onClick={() => void syncNow()}>
              <RefreshCw className="size-5" /> Retry now
            </Button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function StatusDot({ tone, pulse = false }: { tone: "success" | "warning"; pulse?: boolean }) {
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
        className={cn("relative inline-flex size-2 rounded-full", tone === "success" ? "bg-success" : "bg-accent")}
      />
    </span>
  );
}
