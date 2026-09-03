"use client";

import { useEffect } from "react";

import { startSyncEngine } from "@/lib/sync/sync-engine";

/**
 * Mount once near the root of the app to start the background outbox sync
 * engine. Runs only in the browser; on SSR it is a no-op.
 *
 * The active user/database is configured by `DatabaseProvider`.
 */
export function SyncProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const stop = startSyncEngine();
    return () => {
      stop?.();
    };
  }, []);

  return children;
}
