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
  const collection = db.outboxMutations.orderBy("createdAt");
  return userId ? collection.filter((mutation) => mutation.userId === userId).toArray() : collection.toArray();
}

export function listRetryableMutations(): Promise<OutboxMutation[]> {
  const db = getDb();
  return db.outboxMutations
    .filter((mutation) => mutation.attempts < MAX_RETRY_ATTEMPTS)
    .toArray();
}

export function countPendingMutations(userId?: string | null): Promise<number> {
  const db = getDb();
  return userId ? db.outboxMutations.where("userId").equals(userId).count() : db.outboxMutations.count();
}

export function removeMutation(id: string): Promise<void> {
  return getDb().outboxMutations.delete(id);
}

export async function acknowledgeMutation(mutation: OutboxMutation, serverUpdatedAt: string): Promise<void> {
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
    });
  });
}

export function markMutationFailed(id: string, error: string): Promise<void> {
  return getDb().outboxMutations
    .where("id")
    .equals(id)
    .modify((mutation) => {
      mutation.attempts += 1;
      mutation.lastError = error;
    })
    .then(() => undefined);
}

export function shouldRetryMutation(mutation: OutboxMutation): boolean {
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

  const count = await getDb().outboxMutations
    .where("createdAt")
    .below(cutoff.toISOString())
    .delete();

  if (count > 0) {
    logger.info("Cleaned up old mutations", { count, cutoff: cutoff.toISOString() });
  }

  return count;
}
