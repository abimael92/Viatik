"use client";

import { useEffect, useState } from "react";
import { liveQuery } from "dexie";

import { useDatabase } from "@/lib/db/database-provider";
import { getSyncState, subscribeToSync, type SyncStatus } from "@/lib/sync/sync-engine";

export interface SyncStatusState {
  status: SyncStatus;
  pending: number;
  lastSyncAt: string | null;
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
    const unsubscribe = subscribeToSync((status, pending, lastSyncAt) => {
      setState((previous) => ({ ...previous, status, pending, lastSyncAt, isOnline: navigator.onLine }));
    });
    const conflictSubscription = liveQuery(() => db.syncConflicts.count()).subscribe({ next: (conflicts) => setState((previous) => ({ ...previous, conflicts })) });

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
