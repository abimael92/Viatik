import type { SyncStatus } from "@/lib/sync/sync-engine";

/**
 * A missing local trip is only "not found" once this tab has pulled from the
 * server, sync has stopped trying, or the wait has timed out. Before that a
 * fresh browser's IndexedDB is simply empty.
 */
export function isHydratingTrip(
  tripMissing: boolean,
  sync: { status: SyncStatus; lastSyncAt: string | null },
  timedOut: boolean,
): boolean {
  if (!tripMissing || timedOut || sync.lastSyncAt !== null) return false;
  return sync.status !== "offline" && sync.status !== "error";
}
