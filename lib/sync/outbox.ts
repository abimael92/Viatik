import { db } from "@/lib/db/dexie";
import type { OutboxEntityType, OutboxMutation, OutboxOperation } from "@/lib/sync/types";

/**
 * Append a mutation to the outbox. Called by every repository write
 * (create/update/move/remove) right after the Dexie write itself, so the
 * two are as close to atomic as Dexie's single-tab transactions allow.
 *
 * `payload` should be the full current row (or `null` for deletes) so that
 * replaying the queue is idempotent regardless of how many local writes
 * happened before the sync engine got a chance to run.
 */
export async function enqueueMutation(params: {
  entityType: OutboxEntityType;
  entityId: string;
  tripId: string;
  operation: OutboxOperation;
  payload: Record<string, unknown> | null;
  mutatedAt: string;
}): Promise<void> {
  const mutation: OutboxMutation = {
    id: crypto.randomUUID(),
    entityType: params.entityType,
    entityId: params.entityId,
    tripId: params.tripId,
    operation: params.operation,
    payload: params.payload,
    mutatedAt: params.mutatedAt,
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastError: null,
  };
  await db.outboxMutations.add(mutation);
}

export function listPendingMutations(): Promise<OutboxMutation[]> {
  return db.outboxMutations.orderBy("createdAt").toArray();
}

export function countPendingMutations(): Promise<number> {
  return db.outboxMutations.count();
}

export function removeMutation(id: string): Promise<void> {
  return db.outboxMutations.delete(id);
}

export function markMutationFailed(id: string, error: string): Promise<void> {
  return db.outboxMutations
    .where("id")
    .equals(id)
    .modify((mutation) => {
      mutation.attempts += 1;
      mutation.lastError = error;
    })
    .then(() => undefined);
}
