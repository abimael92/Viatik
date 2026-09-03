export type OutboxEntityType = "trip" | "tripMember" | "invitation" | "activity" | "expense" | "expenseShare" | "settlement" | "media" | "contact" | "tripTraveler";
export type OutboxOperation = "insert" | "update" | "delete";

/**
 * A single queued mutation waiting to be replayed against Supabase. `payload`
 * is the full current local row (post-mutation) so replay is idempotent —
 * we always PUT the latest known state rather than a diff.
 */
export interface SyncMetadata {
  key: string;
  value: string;
}

export interface SyncLease {
  key: string;
  ownerToken: string;
  acquiredAt: number;
  heartbeatAt: number;
  expiresAt: number;
}

export interface SyncConflict {
  id: string;
  entityType: OutboxEntityType;
  entityId: string;
  tripId: string;
  localUpdatedAt: string;
  remoteUpdatedAt: string;
  resolvedAt: string;
  resolution: "local" | "remote" | "merged";
}

export interface OutboxMutation {
  id: string;
  entityType: OutboxEntityType;
  entityId: string;
  tripId: string;
  userId: string | null;
  operation: OutboxOperation;
  payload: Record<string, unknown> | null;
  baseUpdatedAt?: string | null;
  revision?: number;
  /** Client-side timestamp of the mutation, used for Last-Write-Wins. */
  mutatedAt: string;
  createdAt: string;
  attempts: number;
  lastError: string | null;
}
