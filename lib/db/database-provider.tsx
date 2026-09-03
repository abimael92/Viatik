"use client";

import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";

import { closeDatabase, getCurrentDatabase, getDatabase, setCurrentDatabase, subscribeToDatabaseChanges } from "@/lib/db/dexie";
import { configureSyncUser } from "@/lib/sync/sync-context";
import type { ViatikDatabase } from "@/lib/db/dexie";

const DatabaseContext = createContext<ViatikDatabase | null>(null);

export function useDatabase(): ViatikDatabase {
  const db = useContext(DatabaseContext);
  if (!db) throw new Error("useDatabase must be used within a DatabaseProvider");
  return db;
}

/**
 * Provides the namespaced IndexedDB instance for the active user.
 *
 * The database is only instantiated inside `useEffect` so it never runs during
 * SSR. Components below this provider can use `useDatabase()`.
 */
export function DatabaseProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const db = useSyncExternalStore(subscribeToDatabaseChanges, getCurrentDatabase, () => null);

  useEffect(() => {
    const instance = getDatabase(userId);
    setCurrentDatabase(instance);
    configureSyncUser(userId);

    return () => {
      setCurrentDatabase(null);
      configureSyncUser(null);
      void closeDatabase(userId).catch(() => {});
    };
  }, [userId]);

  if (!db) return null;

  return <DatabaseContext.Provider value={db}>{children}</DatabaseContext.Provider>;
}
