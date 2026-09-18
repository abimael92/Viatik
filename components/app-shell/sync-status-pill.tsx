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
import { useI18n } from "@/lib/i18n/i18n-provider";
import { cn } from "@/lib/utils";

/**
 * Interactive sync status pill. Shows the offline-ready state, a glowing
 * pulse while changes are pending, and — when there is a live local queue,
 * an error, or unresolved conflicts — opens a dropdown exposing the outbox
 * with a manual retry so the user can push pending mutations on demand.
 */
export function SyncStatusPill({ compact = false }: { compact?: boolean }) {
  const sync = useSyncStatus();
  const { t } = useI18n();
  const db = useDatabase();
  const triggerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [triggerRect, setTriggerRect] = useState<DOMRect | null>(null);
  const [queue, setQueue] = useState<OutboxMutation[]>([]);
  const [resyncCountdown, setResyncCountdown] = useState<number | null>(null);
  const resyncScheduledRef = useRef(false);

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

  const hasPendingChanges = sync.pending > 0 || queue.length > 0;

  useEffect(() => {
    if (!hasPendingChanges) {
      resyncScheduledRef.current = false;
      return;
    }
    if (resyncScheduledRef.current) return;

    resyncScheduledRef.current = true;
    let remaining = 5;
    setResyncCountdown(remaining);
    const timer = window.setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        window.clearInterval(timer);
        setResyncCountdown(null);
        void syncNow();
        return;
      }
      setResyncCountdown(remaining);
    }, 1000);

    return () => {
      window.clearInterval(timer);
      setResyncCountdown(null);
    };
  }, [hasPendingChanges]);

  const offline = !sync.isOnline;
  const interactive =
    offline || sync.status === "error" || sync.conflicts > 0 || sync.pending > 0 || queue.length > 0;

  function compactLabel(value: string) {
    return <span className={compact ? "max-w-28 truncate text-xs font-semibold" : undefined} title={compact ? value : undefined}>{value}</span>;
  }

  function renderPill() {
    if (offline) {
      return (
        <Badge variant="success">
          <StatusDot tone="success" pulse />
          {compactLabel(t("common.offlineSaved"))}
        </Badge>
      );
    }
    if (sync.status === "syncing") {
      return (
        <Badge variant="muted">
          <LoaderCircle className="size-3 animate-spin text-primary" />
          {compactLabel(t("common.syncing"))}
        </Badge>
      );
    }
    if (sync.status === "error") {
      return (
        <Badge variant="warning">
          <StatusDot tone="warning" pulse />
          {compactLabel(t("common.syncIssue"))}
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
          {compactLabel(t("common.pendingChanges"))}
        </Badge>
      );
    }
    if (sync.conflicts > 0) {
      return (
        <Badge variant="warning">
          <StatusDot tone="warning" pulse />
          {compactLabel(t("common.resolveConflicts"))}
        </Badge>
      );
    }
    return (
      <Badge variant="success">
        <StatusDot tone="success" />
        {compactLabel(t("common.synced"))}
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
          "inline-flex min-w-0 max-w-40 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          !interactive && "cursor-default"
        )}
      >
        {renderPill()}
      </button>

      {/* Portaled to <body> so the overlay + dropdown aren't clipped by the
          sidebar's overflow-hidden / backdrop-blur. */}
      {open && createPortal(
        <button type="button" aria-label={t("common.closeSyncPanel")} className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />,
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
            <p className="text-[11px] font-bold uppercase tracking-widest text-white/50">{t("common.syncQueue")}</p>
            <Badge variant="outline" className="text-[11px]!">{queue.length}</Badge>
          </div>

          <div className="max-h-56 overflow-y-auto">
            {queue.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-white/40">{t("common.queueClear")}</p>
            ) : (
              <ul className="divide-y divide-white/5 px-2 py-1">
                {queue.slice(0, 8).map((mutation) => (
                  <li key={mutation.id} className="flex items-center gap-2 px-2 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-white/80">{mutation.entityType}</span>
                      <span className="block text-[11px] uppercase tracking-widest text-white/35">
                        {mutation.operation} · {mutation.attempts} {mutation.attempts === 1 ? t("common.attempt") : t("common.attempts")}
                      </span>
                    </span>
                    {mutation.lastError && (
                      <AlertTriangle className="size-3.5 shrink-0 text-accent" aria-label={t("common.error")} />
                    )}
                  </li>
                ))}
                {queue.length > 8 && (
                  <li className="px-2 py-1.5 text-center text-[11px] uppercase tracking-widest text-white/35">
                    + {queue.length - 8} {t("common.more")}
                  </li>
                )}
              </ul>
            )}
          </div>

          <div className="border-t border-white/10 p-2">
            <Button
              size="sm"
              variant="primary"
              className="w-full"
              onClick={() => {
                setResyncCountdown(null);
                void syncNow();
              }}
            >
              <RefreshCw className="size-5" />
              {resyncCountdown !== null
                ? t("common.resyncIn", { count: resyncCountdown })
                : t("common.resyncNow")}
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
