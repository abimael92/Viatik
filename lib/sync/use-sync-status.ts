"use client";

import { useEffect, useRef, useState } from "react";
import { liveQuery } from "dexie";

import { useDatabase } from "@/lib/db/database-provider";
import { getSyncState, retryFailedMutations, subscribeToSync, syncNow, type SyncStatus } from "@/lib/sync/sync-engine";

export interface SyncStatusState {
  status: SyncStatus;
  pending: number;
  retryablePending: number;
  lastSyncAt: string | null;
  lastError: string | null;
  isOnline: boolean;
  conflicts: number;
}

export function useSyncStatus(): SyncStatusState {
  const db = useDatabase();
  const [state, setState] = useState<SyncStatusState>(() => ({
    ...getSyncState(),
    isOnline: true,
    conflicts: 0,
  }));

  useEffect(() => {
    const unsubscribe = subscribeToSync((status, pending, retryablePending, lastSyncAt, lastError) => {
      setState((previous) => ({ ...previous, status, pending, retryablePending, lastSyncAt, lastError, isOnline: navigator.onLine }));
    });
    // Only surface conflicts that are still unresolved (resolvedAt is null).
    // Sync conflicts auto-resolve during sync (remote wins), so counting every
    // historical record would leave the pill stuck showing "N conflicts to
    // resolve" forever.
    const conflictSubscription = liveQuery(() => db.syncConflicts.filter((conflict) => conflict.resolvedAt === null).count()).subscribe({ next: (conflicts) => setState((previous) => ({ ...previous, conflicts })) });

    function handleOnline() {
      setState((prev) => ({ ...prev, isOnline: true }));
    }

    function handleOffline() {
      setState((prev) => ({ ...prev, isOnline: false }));
    }

    const onlineTimer = window.setTimeout(() => setState((previous) => ({ ...previous, isOnline: navigator.onLine })), 0);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.clearTimeout(onlineTimer);
      unsubscribe();
      conflictSubscription.unsubscribe();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [db]);

  return state;
}

const SYNC_RETRY_SECONDS = 5;

export function useSyncRetryCountdown(sync: SyncStatusState): {
  countdown: number | null;
  retryNow: () => void;
} {
  const [countdown, setCountdown] = useState<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const scheduledRef = useRef(false);

  useEffect(() => {
    const shouldRetry = sync.isOnline && (sync.retryablePending > 0 || (sync.status === "error" && sync.pending === 0));
    if (!shouldRetry) {
      scheduledRef.current = false;
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }
    if (scheduledRef.current) return;

    scheduledRef.current = true;
    let remaining = SYNC_RETRY_SECONDS;
    setCountdown(remaining);
    timerRef.current = window.setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        if (timerRef.current !== null) window.clearInterval(timerRef.current);
        timerRef.current = null;
        scheduledRef.current = false;
        setCountdown(null);
        void syncNow().catch(() => undefined);
        return;
      }
      setCountdown(remaining);
    }, 1000);

    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      timerRef.current = null;
      scheduledRef.current = false;
    };
  }, [sync.isOnline, sync.pending, sync.retryablePending, sync.status, scheduledRef, timerRef]);

  function retryNow() {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    scheduledRef.current = false;
    setCountdown(null);
    void retryFailedMutations().catch(() => undefined);
  }

  const shouldRetry = sync.isOnline && (sync.status === "error" || sync.pending > 0);
  return { countdown: shouldRetry ? countdown : null, retryNow };
}
