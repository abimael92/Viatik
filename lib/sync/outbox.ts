import { getCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import type { OutboxMutation } from "@/lib/sync/types";
import { logger } from "@/lib/observability/logger";

const MAX_RETRY_ATTEMPTS = 5;
const BACKOFF_MS = [1000, 5000, 15000, 30000, 60000]; // Progressive backoff

/**
 * Outbox mutation helpers for the sync engine.
 *
 * New repository writes must use `append` from `@/lib/sync/outbox-transactional`
 * inside a `TransactionContext` so that the domain row and outbox entry are
 * committed atomically. Do not call `db.outboxMutations.add` directly.
 */

function getDb(): ViatikDatabase {
  const db = getCurrentDatabase();
  if (!db) throw new Error("No database is open. Wrap calls in DatabaseProvider.");
  return db;
}

export function listPendingMutations(userId?: string | null): Promise<OutboxMutation[]> {
  const db = getDb();
  const collection = db.outboxMutations
    .orderBy("createdAt")
    .filter((mutation) => (mutation.status ?? "pending") !== "blocked");
  return userId
    ? collection.filter((mutation) => mutation.userId === userId).toArray()
    : collection.toArray();
}

export function listRetryableMutations(): Promise<OutboxMutation[]> {
  const db = getDb();
  return db.outboxMutations
    .filter(
      (mutation) =>
        (mutation.status ?? "pending") !== "blocked" && mutation.attempts < MAX_RETRY_ATTEMPTS
    )
    .toArray();
}

export function countPendingMutations(userId?: string | null): Promise<number> {
  const db = getDb();
  const collection = db.outboxMutations.filter(
    (mutation) => (mutation.status ?? "pending") !== "blocked"
  );
  return userId
    ? collection.and((mutation) => mutation.userId === userId).count()
    : collection.count();
}

export function countRetryableMutations(userId?: string | null): Promise<number> {
  const db = getDb();
  const collection = db.outboxMutations.filter(
    (mutation) =>
      (mutation.status ?? "pending") !== "blocked" && mutation.attempts < MAX_RETRY_ATTEMPTS
  );
  return userId
    ? collection.and((mutation) => mutation.userId === userId).count()
    : collection.count();
}

export function removeMutation(id: string): Promise<void> {
  return getDb().outboxMutations.delete(id);
}

export async function acknowledgeMutation(
  mutation: OutboxMutation,
  serverUpdatedAt: string
): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.outboxMutations, async () => {
    const current = await db.outboxMutations.get(mutation.id);
    if (!current) return;
    if (current.revision === mutation.revision) {
      await db.outboxMutations.delete(current.id);
      return;
    }
    await db.outboxMutations.put({
      ...current,
      operation: mutation.operation === "delete" ? "insert" : "update",
      baseUpdatedAt: mutation.operation === "delete" ? null : serverUpdatedAt,
      attempts: 0,
      lastError: null,
      status: "pending",
    });
  });
}

export function markMutationFailed(id: string, error: string): Promise<void> {
  return getDb()
    .outboxMutations.where("id")
    .equals(id)
    .modify((mutation) => {
      mutation.attempts += 1;
      mutation.lastError = error;
      mutation.status = "pending";
    })
    .then(() => undefined);
}

/**
 * True when a mutation failed only because PostgREST had not yet picked up a
 * migration (e.g. a freshly created table or function). Such errors are
 * inherently transient — they resolve once migrations are applied/reloaded —
 * so a mutation should never be permanently dropped because of them.
 */
export function isTransientSchemaCacheError(message: string | null | undefined): boolean {
  if (!message) return false;
  return (
    message.includes("in the schema cache") ||
    message.includes("Could not find the function") ||
    message.includes("Could not find the table") ||
    message.includes("Could not find the relation") ||
    message.includes("has no field") ||
    message.includes("null value in column")
  );
}

/** Clear the failure state so a mutation is retried on the next sync pass. */
export function resetMutationAttempts(id: string): Promise<void> {
  return getDb()
    .outboxMutations.where("id")
    .equals(id)
    .modify((mutation) => {
      mutation.attempts = 0;
      mutation.lastError = null;
      mutation.status = "pending";
    })
    .then(() => undefined);
}

/** Reset failed pending mutations for an explicit user-triggered retry. */
export async function resetPendingMutationAttempts(userId?: string | null): Promise<number> {
  const pending = await listPendingMutations(userId);
  const failed = pending.filter((mutation) => mutation.attempts > 0);
  await Promise.all(failed.map((mutation) => resetMutationAttempts(mutation.id)));
  return failed.length;
}

export function blockMutation(id: string, error: string): Promise<void> {
  return getDb()
    .outboxMutations.where("id")
    .equals(id)
    .modify((mutation) => {
      mutation.status = "blocked";
      mutation.lastError = error;
    })
    .then(() => undefined);
}

export function shouldRetryMutation(mutation: OutboxMutation): boolean {
  if ((mutation.status ?? "pending") === "blocked") return false;
  if (mutation.attempts >= MAX_RETRY_ATTEMPTS) {
    logger.warn("Mutation exceeded max retry attempts", {
      id: mutation.id,
      attempts: mutation.attempts,
      entityType: mutation.entityType,
      lastError: mutation.lastError,
    });
    return false;
  }
  return true;
}

export function getRetryDelay(attempts: number): number {
  // Use progressive backoff, capped at the maximum delay
  const index = Math.min(attempts, BACKOFF_MS.length - 1);
  return BACKOFF_MS[index];
}

export async function cleanupOldMutations(olderThanDays: number = 7): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - olderThanDays);

  const count = await getDb()
    .outboxMutations.where("createdAt")
    .below(cutoff.toISOString())
    .delete();

  if (count > 0) {
    logger.info("Cleaned up old mutations", { count, cutoff: cutoff.toISOString() });
  }

  return count;
}
