"use client";

import { useEffect, useState } from "react";

import { getSyncState, subscribeToSync, type SyncStatus } from "@/lib/sync/sync-engine";

export interface SyncStatusState {
  status: SyncStatus;
  pending: number;
  lastSyncAt: string | null;
  isOnline: boolean;
}

export function useSyncStatus(): SyncStatusState {
  const [state, setState] = useState<SyncStatusState>(() => ({
    ...getSyncState(),
    isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
  }));

  useEffect(() => {
    const unsubscribe = subscribeToSync((status, pending, lastSyncAt) => {
      setState({ status, pending, lastSyncAt, isOnline: navigator.onLine });
    });

    function handleOnline() {
      setState((prev) => ({ ...prev, isOnline: true }));
    }

    function handleOffline() {
      setState((prev) => ({ ...prev, isOnline: false }));
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      unsubscribe();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return state;
}
