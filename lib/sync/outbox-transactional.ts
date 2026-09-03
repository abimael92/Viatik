import { TransactionContext } from "@/lib/db/transaction-context";
import { getSyncUser } from "@/lib/sync/sync-context";
import type { OutboxEntityType, OutboxMutation, OutboxOperation } from "@/lib/sync/types";

/**
 * Shape of the data passed to `append`.
 *
 * `id` is required so the outbox can identify the affected row.
 * `tripId` is optional and defaults to `id` for entities like contacts or trips.
 * `updatedAt` and optional `mutatedAt` are used for last-write-wins ordering.
 */
export type OutboxAppendData = object & {
  id: string;
  tripId?: string;
  updatedAt?: string;
  mutatedAt?: string;
};

/**
 * Append an outbox mutation inside an existing transaction.
 *
 * `data` is the affected entity (or, for deletes, an object carrying its
 * `id`, `tripId`, and `updatedAt`/`mutatedAt`). The payload stored in the
 * outbox is the full `data` for inserts/updates and `null` for deletes.
 */
export async function append(
  table: OutboxEntityType,
  op: OutboxOperation,
  data: OutboxAppendData,
  { tx, baseUpdatedAt }: { tx: TransactionContext; baseUpdatedAt: string | null }
): Promise<string> {
  const record = data as Record<string, unknown>;
  const { mutatedAt: explicitMutatedAt, ...payload } = record;
  const mutatedAt =
    (explicitMutatedAt as string | undefined) ??
    (record.updatedAt as string | undefined) ??
    (record.deletedAt as string | null | undefined) ??
    new Date().toISOString();
  const outbox = tx.table<OutboxMutation>("outboxMutations");
  const entityId = String(data.id);
  const existing = await outbox.where("entityType").equals(table).and((mutation) => mutation.entityId === entityId).first();

  if (existing && existing.operation === "insert" && op === "delete") {
    await outbox.delete(existing.id);
    return existing.id;
  }

  const mutation: OutboxMutation = {
    id: existing?.id ?? crypto.randomUUID(),
    entityType: table,
    entityId,
    tripId: data.tripId ? String(data.tripId) : String(data.id),
    userId: getSyncUser(),
    operation: existing?.operation === "insert" ? "insert" : op,
    payload: op === "delete" ? null : payload,
    baseUpdatedAt: existing ? existing.baseUpdatedAt : baseUpdatedAt,
    revision: existing ? (existing.revision ?? 1) + 1 : 1,
    mutatedAt: String(mutatedAt),
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    attempts: 0,
    lastError: null,
  };

  await outbox.put(mutation);
  return mutation.id;
}
