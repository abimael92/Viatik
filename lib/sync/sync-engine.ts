import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { getCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import type { Activity, Contact, Expense, ExpenseSettlement, ExpenseShare, Trip, TripInvitation, TripMember, TripTraveler } from "@/features/domain/entities";
import type { TripMedia } from "@/features/domain/entities-media";
import {
  acknowledgeMutation,
  countPendingMutations,
  listPendingMutations,
  markMutationFailed,
  removeMutation,
  shouldRetryMutation,
  getRetryDelay,
} from "@/lib/sync/outbox";
import type { OutboxMutation } from "@/lib/sync/types";
import {
  activityToRow,
  tripToRow,
  expenseToRow,
  expenseShareToRow,
  tripMemberToRow,
  invitationToRow,
  settlementToRow,
  mediaToRow,
  contactToRow,
  tripTravelerToRow,
} from "@/lib/supabase/mappers";
import { logger } from "@/lib/observability/logger";
import { deleteRemoteMedia, processPendingMedia, pullRemoteChanges, startRealtimeSync } from "@/lib/sync/cloud-sync";
import { getSyncUser } from "@/lib/sync/sync-context";
import { createBrowserSyncCoordinator, SyncCoordinationInterruptedError, type BrowserSyncCoordinator, type SyncExecutionContext, type SyncScope } from "@/lib/sync/sync-coordinator";

function getDb(): ViatikDatabase {
  const db = getCurrentDatabase();
  if (!db) throw new Error("No database is open. Wrap calls in DatabaseProvider.");
  return db;
}

export type SyncStatus = "idle" | "syncing" | "offline" | "error";

const listeners: Array<(status: SyncStatus, pending: number, lastSyncAt: string | null) => void> =
  [];

let status: SyncStatus = "idle";
let lastSyncAt: string | null = null;

// Sync diagnostics
interface SyncDiagnostics {
  totalSyncAttempts: number;
  successfulSyncs: number;
  failedSyncs: number;
  lastSyncError: string | null;
  conflictEvents: number;
  averageSyncDuration: number; // in milliseconds
}

const syncDiagnostics: SyncDiagnostics = {
  totalSyncAttempts: 0,
  successfulSyncs: 0,
  failedSyncs: 0,
  lastSyncError: null,
  conflictEvents: 0,
  averageSyncDuration: 0,
};

const syncDurations: number[] = [];

function notify() {
  for (const cb of listeners) cb(status, countPending, lastSyncAt);
}

let countPending = 0;
async function refreshPending() {
  const [mutations, mediaUploads] = await Promise.all([countPendingMutations(getSyncUser()), getDb().tripMedia.where("uploadStatus").anyOf("pending", "failed", "uploading").filter((media) => media.createdBy === getSyncUser()).count()]);
  countPending = mutations + mediaUploads;
  notify();
}

function setStatus(newStatus: SyncStatus) {
  const oldStatus = status;
  status = newStatus;
  logger.debug("Sync status changed", { from: oldStatus, to: newStatus, pending: countPending });
  notify();
}

async function recordConflict(mutation: OutboxMutation, remoteUpdatedAt: string, resolution: "local" | "remote" | "merged"): Promise<void> {
  await getDb().syncConflicts.add({ id: crypto.randomUUID(), entityType: mutation.entityType, entityId: mutation.entityId, tripId: mutation.tripId, localUpdatedAt: mutation.mutatedAt, remoteUpdatedAt, resolvedAt: new Date().toISOString(), resolution });
}

type CasResult = {
  status: "applied" | "conflict" | "not_found";
  server_updated_at?: string | null;
  current?: Record<string, unknown> | null;
};

function mutationPayloadToRow(mutation: OutboxMutation): Record<string, unknown> {
  if (!mutation.payload) throw new Error(`Missing payload for ${mutation.entityType} ${mutation.operation}`);
  switch (mutation.entityType) {
    case "trip": return tripToRow(mutation.payload as unknown as Trip);
    case "tripMember": return tripMemberToRow(mutation.payload as unknown as TripMember);
    case "invitation": return invitationToRow(mutation.payload as unknown as TripInvitation);
    case "activity": return activityToRow(mutation.payload as unknown as Activity);
    case "expense": return expenseToRow(mutation.payload as unknown as Expense);
    case "expenseShare": return expenseShareToRow(mutation.payload as unknown as ExpenseShare);
    case "settlement": return settlementToRow(mutation.payload as unknown as ExpenseSettlement);
    case "media": return mediaToRow(mutation.payload as unknown as TripMedia);
    case "contact": return contactToRow(mutation.payload as unknown as Contact);
    case "tripTraveler": return tripTravelerToRow(mutation.payload as unknown as TripTraveler);
  }
}

async function resolveCasConflict(mutation: OutboxMutation, result: CasResult): Promise<void> {
  syncDiagnostics.conflictEvents++;
  const remoteUpdatedAt = result.server_updated_at ?? "unknown";
  await recordConflict(mutation, remoteUpdatedAt, "remote");
  await removeMutation(mutation.id);
  await pullRemoteChanges(true);
}

async function replayCasMutation(mutation: OutboxMutation): Promise<boolean> {
  if (mutation.baseUpdatedAt === undefined || (mutation.operation !== "insert" && mutation.baseUpdatedAt === null)) {
    await resolveCasConflict(mutation, { status: "conflict" });
    return false;
  }

  const client = getSupabaseBrowserClient();
  const response = mutation.operation === "delete"
    ? await client.rpc("sync_cas_delete", { p_entity: mutation.entityType, p_id: mutation.entityId, p_base_updated_at: mutation.baseUpdatedAt })
    : mutation.entityType === "contact"
      ? await client.rpc("sync_contact_cas_upsert", { p_payload: mutationPayloadToRow(mutation), p_base_updated_at: mutation.baseUpdatedAt })
      : await client.rpc("sync_cas_upsert", { p_entity: mutation.entityType, p_payload: mutationPayloadToRow(mutation), p_base_updated_at: mutation.baseUpdatedAt });
  if (response.error) throw new Error(response.error.message);
  const result = response.data as CasResult;
  if (result.status === "conflict" || (result.status === "not_found" && mutation.operation !== "delete")) {
    await resolveCasConflict(mutation, result);
    return false;
  }
  if (mutation.operation !== "delete" && !result.server_updated_at) throw new Error("CAS upsert did not return server_updated_at");
  await acknowledgeMutation(mutation, result.server_updated_at ?? "");
  return true;
}

async function replayOne(mutation: OutboxMutation) {
  logger.debug("Replaying mutation", {
    id: mutation.id,
    entityType: mutation.entityType,
    operation: mutation.operation,
    entityId: mutation.entityId,
    attempt: mutation.attempts,
  });

  try {
    const applied = await replayCasMutation(mutation);
    if (!applied) return;
    if (mutation.entityType === "media" && mutation.payload?.deletedAt && mutation.payload.storagePath) await deleteRemoteMedia(String(mutation.payload.storagePath));

    logger.debug("Mutation replayed successfully", {
      id: mutation.id,
      entityType: mutation.entityType,
    });
  } catch (error) {
    logger.error("Failed to replay mutation", error instanceof Error ? error : new Error(String(error)), {
      mutationId: mutation.id,
      entityType: mutation.entityType,
      operation: mutation.operation,
      entityId: mutation.entityId,
      attempt: mutation.attempts,
    });
    throw error;
  }
}

let coordinator: BrowserSyncCoordinator | null = null;
let coordinatorDatabase: ViatikDatabase | null = null;
let stopCoordinatorSubscription: (() => void) | null = null;

function getCoordinator(db: ViatikDatabase, scope: SyncScope): BrowserSyncCoordinator {
  if (coordinator && coordinatorDatabase === db) return coordinator;
  stopCoordinatorSubscription?.();
  coordinator?.close();
  coordinator = createBrowserSyncCoordinator(db);
  coordinatorDatabase = db;
  stopCoordinatorSubscription = coordinator.subscribe(scope, (event) => {
    if (event.type === "requested") void runSync().catch(() => setStatus("error"));
    if (event.type === "completed") void refreshPending();
  });
  return coordinator;
}

async function runCoordinatedSync(): Promise<void> {
  const syncUser = getSyncUser();
  if (!syncUser) {
    setStatus("idle");
    return;
  }
  const db = getDb();
  const scope = { databaseName: db.name, userId: syncUser };
  const activeCoordinator = getCoordinator(db, scope);
  try {
    const result = await activeCoordinator.runExclusive(scope, syncOnce);
    if (!result.acquired) await refreshPending();
  } catch (error) {
    if (!(error instanceof SyncCoordinationInterruptedError)) throw error;
    await refreshPending();
    setStatus(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "idle");
  }
}

async function syncOnce(context?: SyncExecutionContext): Promise<void> {
  context?.signal.throwIfAborted();
  const startTime = Date.now();
  syncDiagnostics.totalSyncAttempts++;

  logger.debug("Sync started", { pending: countPending });

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    logger.info("Sync skipped - offline");
    setStatus("offline");
    return;
  }

  setStatus("syncing");
  const syncUser = getSyncUser();
  if (!syncUser) {
    setStatus("idle");
    return;
  }
  const pending = await listPendingMutations(syncUser);
  context?.signal.throwIfAborted();

  logger.info("Processing pending mutations", { count: pending.length });

  let successCount = 0;
  let failureCount = 0;
  let skippedCount = 0;

  for (const mutation of pending) {
    context?.signal.throwIfAborted();
    // Check if mutation should be retried
    if (!shouldRetryMutation(mutation)) {
      logger.warn("Skipping mutation that exceeded max retries", {
        id: mutation.id,
        attempts: mutation.attempts,
        entityType: mutation.entityType,
      });
      skippedCount++;
      continue;
    }

    // Apply backoff if this mutation has failed before
    if (mutation.attempts > 0) {
      const delay = getRetryDelay(mutation.attempts);
      logger.debug("Applying backoff for failed mutation", {
        id: mutation.id,
        attempts: mutation.attempts,
        delay,
      });
      await new Promise((resolve) => setTimeout(resolve, delay));
      context?.signal.throwIfAborted();
    }

    try {
      await replayOne(mutation);
      successCount++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Mutation failed, marking as failed", error instanceof Error ? error : new Error(String(error)), {
        mutationId: mutation.id,
        entityType: mutation.entityType,
        attempts: mutation.attempts + 1,
      });
      await markMutationFailed(mutation.id, message);
      failureCount++;
      syncDiagnostics.lastSyncError = message;
    }
  }

  context?.signal.throwIfAborted();
  await processPendingMedia();
  context?.signal.throwIfAborted();
  await pullRemoteChanges(lastSyncAt === null);
  context?.signal.throwIfAborted();

  const duration = Date.now() - startTime;
  syncDurations.push(duration);
  // Keep only last 50 durations for average calculation
  if (syncDurations.length > 50) {
    syncDurations.shift();
  }
  syncDiagnostics.averageSyncDuration =
    syncDurations.reduce((sum, d) => sum + d, 0) / syncDurations.length;

  if (failureCount === 0) {
    syncDiagnostics.successfulSyncs++;
    syncDiagnostics.lastSyncError = null;
  } else {
    syncDiagnostics.failedSyncs++;
  }

  await refreshPending();

  const newStatus = typeof navigator === "undefined" || navigator.onLine ? (countPending > 0 ? "error" : "idle") : "offline";
  setStatus(newStatus);
  lastSyncAt = new Date().toISOString();

  logger.info("Sync completed", {
    duration,
    successCount,
    failureCount,
    skippedCount,
    remainingPending: countPending,
    status: newStatus,
    diagnostics: {
      totalAttempts: syncDiagnostics.totalSyncAttempts,
      successfulSyncs: syncDiagnostics.successfulSyncs,
      failedSyncs: syncDiagnostics.failedSyncs,
      averageDuration: syncDiagnostics.averageSyncDuration,
    },
  });

  notify();
}

let activeSync: Promise<void> | null = null;
let syncRequested = false;

function runSync(): Promise<void> {
  if (activeSync) {
    syncRequested = true;
    return activeSync;
  }
  activeSync = runCoordinatedSync().finally(() => {
    activeSync = null;
    if (syncRequested) {
      syncRequested = false;
      void runSync().catch(() => setStatus("error"));
    }
  });
  return activeSync;
}

function requestPeerSync(): void {
  const syncUser = getSyncUser();
  if (!syncUser) return;
  const db = getDb();
  const scope = { databaseName: db.name, userId: syncUser };
  getCoordinator(db, scope).requestSync(scope);
}

function schedule() {
  if (typeof window === "undefined") return;
  requestPeerSync();
  runSync().catch(() => setStatus("error"));
}

function handleOnline() {
  setStatus("idle");
  schedule();
}

function handleOffline() {
  setStatus("offline");
}

/**
 * Start the background sync engine. Safe to call multiple times; listeners and
 * intervals are only attached once.
 */
let stopEngine: (() => void) | null = null;

export function startSyncEngine() {
  if (typeof window === "undefined") return;
  if (stopEngine) return stopEngine;

  logger.info("Starting sync engine");

  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);
  window.addEventListener("viatik:sync-request", schedule);

  // Drain the queue as soon as the app boots, then retry periodically.
  schedule();
  const stopRealtime = startRealtimeSync();
  const interval = setInterval(schedule, 30000);

  stopEngine = () => {
    logger.info("Stopping sync engine");
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
    window.removeEventListener("viatik:sync-request", schedule);
    clearInterval(interval);
    stopRealtime();
    stopCoordinatorSubscription?.();
    stopCoordinatorSubscription = null;
    coordinator?.close();
    coordinator = null;
    coordinatorDatabase = null;
    stopEngine = null;
  };
  return stopEngine;
}

export function syncNow(): Promise<void> {
  requestPeerSync();
  return runSync();
}

export function getSyncState(): {
  status: SyncStatus;
  pending: number;
  lastSyncAt: string | null;
} {
  return { status, pending: countPending, lastSyncAt };
}

export function getSyncDiagnostics(): SyncDiagnostics {
  return { ...syncDiagnostics };
}

export function subscribeToSync(
  cb: (status: SyncStatus, pending: number, lastSyncAt: string | null) => void
): () => void {
  listeners.push(cb);
  cb(status, countPending, lastSyncAt);
  return () => {
    const index = listeners.indexOf(cb);
    if (index !== -1) listeners.splice(index, 1);
  };
}

// Exposed for testing.
export const __syncEngineInternals = {
  syncOnce,
  runCoordinatedSync,
  refreshPending,
  replayCasMutation,
  resetDiagnostics: () => {
    syncDiagnostics.totalSyncAttempts = 0;
    syncDiagnostics.successfulSyncs = 0;
    syncDiagnostics.failedSyncs = 0;
    syncDiagnostics.lastSyncError = null;
    syncDiagnostics.conflictEvents = 0;
    syncDiagnostics.averageSyncDuration = 0;
    syncDurations.length = 0;
  },
};
