export type OutboxEntityType = "trip" | "activity" | "expense" | "expenseShare";
export type OutboxOperation = "insert" | "update" | "delete";

/**
 * A single queued mutation waiting to be replayed against Supabase. `payload`
 * is the full current local row (post-mutation) so replay is idempotent —
 * we always PUT the latest known state rather than a diff.
 */
export interface OutboxMutation {
  id: string;
  entityType: OutboxEntityType;
  entityId: string;
  tripId: string;
  operation: OutboxOperation;
  payload: Record<string, unknown> | null;
  /** Client-side timestamp of the mutation, used for Last-Write-Wins. */
  mutatedAt: string;
  createdAt: string;
  attempts: number;
  lastError: string | null;
}
