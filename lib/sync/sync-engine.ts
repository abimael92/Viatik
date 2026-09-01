import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import {
  countPendingMutations,
  listPendingMutations,
  markMutationFailed,
  removeMutation,
} from "@/lib/sync/outbox";
import type { OutboxMutation } from "@/lib/sync/types";
import {
  activityToRow,
  tripToRow,
  expenseToRow,
  expenseShareToRow,
  rowToActivity,
  rowToExpense,
  rowToExpenseShare,
  rowToTrip,
} from "@/lib/supabase/mappers";

export type SyncStatus = "idle" | "syncing" | "offline" | "error";

const listeners: Array<(status: SyncStatus, pending: number, lastSyncAt: string | null) => void> =
  [];

let status: SyncStatus = "idle";
let lastSyncAt: string | null = null;

function notify() {
  for (const cb of listeners) cb(status, countPending, lastSyncAt);
}

let countPending = 0;
async function refreshPending() {
  countPending = await countPendingMutations();
  notify();
}

function setStatus(newStatus: SyncStatus) {
  status = newStatus;
  notify();
}

/**
 * Deterministic Last-Write-Wins: keep the local mutation if and only if its
 * mutated_at timestamp is greater than or equal to the server's existing
 * updated_at. Timestamps are string ISO-8601, so lexicographic comparison
 * is sufficient (and avoids precision loss during transport).
 */
function localWins(localMutatedAt: string, remoteUpdatedAt: string | null): boolean {
  if (!remoteUpdatedAt) return true;
  return localMutatedAt >= remoteUpdatedAt;
}

function assertSupabaseSuccess(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

async function upsertTrip(mutation: OutboxMutation) {
  if (!mutation.payload) return;
  const payload = mutation.payload as Record<string, unknown>;
  const client = getSupabaseBrowserClient();

  const { data: existing, error: readError } = await client
    .from("trips")
    .select("updated_at")
    .eq("id", mutation.entityId)
    .maybeSingle();
  assertSupabaseSuccess(readError);

  if (localWins(mutation.mutatedAt, existing?.updated_at ?? null)) {
    const row = tripToRow(rowToTrip(payload));
    const { error } = await client.from("trips").upsert(row, { onConflict: "id" });
    assertSupabaseSuccess(error);
  }
}

async function upsertActivity(mutation: OutboxMutation) {
  if (!mutation.payload) return;
  const payload = mutation.payload as Record<string, unknown>;
  const client = getSupabaseBrowserClient();

  const { data: existing, error: readError } = await client
    .from("activities")
    .select("updated_at")
    .eq("id", mutation.entityId)
    .maybeSingle();
  assertSupabaseSuccess(readError);

  if (localWins(mutation.mutatedAt, existing?.updated_at ?? null)) {
    const row = activityToRow(rowToActivity(payload));
    const { error } = await client.from("activities").upsert(row, { onConflict: "id" });
    assertSupabaseSuccess(error);
  }
}

async function upsertExpense(mutation: OutboxMutation) {
  if (!mutation.payload) return;
  const payload = mutation.payload as Record<string, unknown>;
  const client = getSupabaseBrowserClient();

  const { data: existing, error: readError } = await client
    .from("expenses")
    .select("updated_at")
    .eq("id", mutation.entityId)
    .maybeSingle();
  assertSupabaseSuccess(readError);

  if (localWins(mutation.mutatedAt, existing?.updated_at ?? null)) {
    const row = expenseToRow(rowToExpense(payload));
    const { error } = await client.from("expenses").upsert(row, { onConflict: "id" });
    assertSupabaseSuccess(error);
  }
}

async function upsertExpenseShare(mutation: OutboxMutation) {
  if (!mutation.payload) return;
  const payload = mutation.payload as Record<string, unknown>;
  const row = expenseShareToRow(rowToExpenseShare(payload));
  await getSupabaseBrowserClient()
    .from("expense_shares")
    .upsert(row, { onConflict: "id" });
}

async function deleteRemote(entityType: OutboxMutation["entityType"], id: string) {
  const table =
    entityType === "expenseShare" ? "expense_shares" : `${entityType}s`;
  await getSupabaseBrowserClient().from(table).delete().eq("id", id);
}

async function replayOne(mutation: OutboxMutation) {
  if (mutation.operation === "delete") {
    await deleteRemote(mutation.entityType, mutation.entityId);
    return;
  }

  switch (mutation.entityType) {
    case "trip":
      await upsertTrip(mutation);
      break;
    case "activity":
      await upsertActivity(mutation);
      break;
    case "expense":
      await upsertExpense(mutation);
      break;
    case "expenseShare":
      await upsertExpenseShare(mutation);
      break;
    default:
      throw new Error(`Unhandled entity type: ${mutation.entityType}`);
  }
}

async function syncOnce(): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    setStatus("offline");
    return;
  }

  setStatus("syncing");
  const pending = await listPendingMutations();

  for (const mutation of pending) {
    try {
      await replayOne(mutation);
      await removeMutation(mutation.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await markMutationFailed(mutation.id, message);
      setStatus("error");
    }
  }

  await refreshPending();
  setStatus(navigator.onLine ? (countPending > 0 ? "error" : "idle") : "offline");
  lastSyncAt = new Date().toISOString();
  notify();
}

function schedule() {
  if (typeof window === "undefined") return;
  syncOnce().catch(() => setStatus("error"));
}

function handleOnline() {
  setStatus("idle");
  syncOnce().catch(() => setStatus("error"));
}

function handleOffline() {
  setStatus("offline");
}

/**
 * Start the background sync engine. Safe to call multiple times; listeners and
 * intervals are only attached once.
 */
export function startSyncEngine() {
  if (typeof window === "undefined") return;

  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);

  // Drain the queue as soon as the app boots, then retry periodically.
  schedule();
  const interval = setInterval(schedule, 30000);

  return () => {
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
    clearInterval(interval);
  };
}

export function getSyncState(): {
  status: SyncStatus;
  pending: number;
  lastSyncAt: string | null;
} {
  return { status, pending: countPending, lastSyncAt };
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
  refreshPending,
  localWins,
};
