import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { getCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import type {
  Activity,
  ActivityPersonalBudget,
  Connection,
  Contact,
  Expense,
  ExpenseSettlement,
  ExpenseShare,
  Trip,
  TripInvitation,
  TripMember,
  TripTraveler,
  UserWallet,
} from "@/features/domain/entities";
import type { TripMedia } from "@/features/domain/entities-media";
import type { VaultEntry, VaultKeyset } from "@/features/vault/domain/vault-types";
import type { TripWeatherForecast } from "@/features/weather/domain/weather-types";
import type { TripShareLink } from "@/features/sharing/domain/share-types";
import type { Notification } from "@/features/notifications/domain/notification-types";
import { TransactionContext } from "@/lib/db/transaction-context";
import { append } from "@/lib/sync/outbox-transactional";
import {
  acknowledgeMutation,
  blockMutation,
  countPendingMutations,
  countRetryableMutations,
  listPendingMutations,
  markMutationFailed,
  removeMutation,
  shouldRetryMutation,
  getRetryDelay,
  isTransientSchemaCacheError,
  resetMutationAttempts,
  resetPendingMutationAttempts,
} from "@/lib/sync/outbox";
import type { OutboxMutation } from "@/lib/sync/types";
import {
  activityToRow,
  activityPersonalBudgetToRow,
  tripToRow,
  expenseToRow,
  expenseShareToRow,
  tripMemberToRow,
  invitationToRow,
  settlementToRow,
  mediaToRow,
  contactToRow,
  connectionToRow,
  tripTravelerToRow,
  userWalletToRow,
  vaultEntryToRow,
  vaultKeysetToRow,
  tripWeatherForecastToRow,
  shareLinkToRow,
  notificationToRow,
} from "@/lib/supabase/mappers";
import { logger } from "@/lib/observability/logger";
import {
  deleteRemoteMedia,
  processPendingMedia,
  pullRemoteChanges,
  startRealtimeSync,
} from "@/lib/sync/cloud-sync";
import { getSyncUser } from "@/lib/sync/sync-context";
import {
  createBrowserSyncCoordinator,
  SyncCoordinationInterruptedError,
  type BrowserSyncCoordinator,
  type SyncExecutionContext,
  type SyncScope,
} from "@/lib/sync/sync-coordinator";

function getDb(): ViatikDatabase {
  const db = getCurrentDatabase();
  if (!db) throw new Error("No database is open. Wrap calls in DatabaseProvider.");
  return db;
}

export type SyncStatus = "idle" | "syncing" | "offline" | "error";

const listeners: Array<
  (
    status: SyncStatus,
    pending: number,
    retryablePending: number,
    lastSyncAt: string | null,
    lastError: string | null
  ) => void
> = [];

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
  for (const cb of listeners)
    cb(status, countPending, retryablePending, lastSyncAt, syncDiagnostics.lastSyncError);
}

let countPending = 0;
let retryablePending = 0;
async function refreshPending() {
  const userId = getSyncUser();
  const [mutations, retryableMutations, mediaUploads, retryableMediaUploads] = await Promise.all([
    countPendingMutations(userId),
    countRetryableMutations(userId),
    getDb()
      .tripMedia.where("uploadStatus")
      .anyOf("pending", "failed", "uploading")
      .filter((media) => media.createdBy === userId)
      .count(),
    getDb()
      .tripMedia.where("uploadStatus")
      .anyOf("pending", "failed", "uploading")
      .filter((media) => media.createdBy === userId && media.uploadAttempts < 5)
      .count(),
  ]);
  countPending = mutations + mediaUploads;
  retryablePending = retryableMutations + retryableMediaUploads;
  notify();
}

function setStatus(newStatus: SyncStatus) {
  const oldStatus = status;
  status = newStatus;
  logger.debug("Sync status changed", { from: oldStatus, to: newStatus, pending: countPending });
  notify();
}

async function recordConflict(
  mutation: OutboxMutation,
  remoteUpdatedAt: string,
  resolution: "local" | "remote" | "merged"
): Promise<void> {
  await getDb().syncConflicts.add({
    id: crypto.randomUUID(),
    entityType: mutation.entityType,
    entityId: mutation.entityId,
    tripId: mutation.tripId,
    localUpdatedAt: mutation.mutatedAt,
    remoteUpdatedAt,
    resolvedAt: new Date().toISOString(),
    resolution,
  });
}

type CasResult = {
  status: "applied" | "conflict" | "not_found";
  server_updated_at?: string | null;
  current?: Record<string, unknown> | null;
};

function mutationPayloadToRow(mutation: OutboxMutation): Record<string, unknown> {
  if (!mutation.payload)
    throw new Error(`Missing payload for ${mutation.entityType} ${mutation.operation}`);
  switch (mutation.entityType) {
    case "trip":
      return tripToRow(mutation.payload as unknown as Trip);
    case "tripMember":
      return tripMemberToRow(mutation.payload as unknown as TripMember);
    case "invitation":
      return invitationToRow(mutation.payload as unknown as TripInvitation);
    case "activity":
      return activityToRow(mutation.payload as unknown as Activity);
    case "activityPersonalBudget":
      return activityPersonalBudgetToRow(mutation.payload as unknown as ActivityPersonalBudget);
    case "expense":
      return expenseToRow(mutation.payload as unknown as Expense);
    case "expenseShare":
      return expenseShareToRow(mutation.payload as unknown as ExpenseShare);
    case "settlement":
      return settlementToRow(mutation.payload as unknown as ExpenseSettlement);
    case "media":
      return mediaToRow(mutation.payload as unknown as TripMedia);
    case "contact":
      return contactToRow(mutation.payload as unknown as Contact);
    case "connectionRequest":
    case "connectionResponse":
      return connectionToRow(mutation.payload as unknown as Connection);
    case "tripTraveler":
      return tripTravelerToRow(mutation.payload as unknown as TripTraveler);
    case "vaultKeyset":
      return vaultKeysetToRow(mutation.payload as unknown as VaultKeyset);
    case "vaultEntry":
      return vaultEntryToRow(mutation.payload as unknown as VaultEntry);
    case "tripWeatherForecast":
      return tripWeatherForecastToRow(mutation.payload as unknown as TripWeatherForecast);
    case "userWallet":
      return userWalletToRow(mutation.payload as unknown as UserWallet);
    case "tripShareLink":
      return shareLinkToRow(mutation.payload as unknown as TripShareLink);
    case "notification":
      return notificationToRow(mutation.payload as unknown as Notification);
  }
}

function mutationDependencyRank(mutation: OutboxMutation): number {
  if (mutation.entityType === "activity") return 0;
  if (mutation.entityType === "expense") return 1;
  if (mutation.entityType === "expenseShare") return 2;
  return 3;
}

function sortPendingMutations(mutations: OutboxMutation[]): OutboxMutation[] {
  return mutations
    .map((mutation, index) => ({ mutation, index }))
    .sort(
      (a, b) =>
        mutationDependencyRank(a.mutation) - mutationDependencyRank(b.mutation) || a.index - b.index
    )
    .map(({ mutation }) => mutation);
}

async function requeueMissingExpenseParent(mutation: OutboxMutation): Promise<boolean> {
  if (mutation.entityType !== "expenseShare" || !mutation.payload) return false;
  const expenseId =
    typeof mutation.payload.expenseId === "string" ? mutation.payload.expenseId : null;
  if (!expenseId) return false;
  const db = getDb();
  const expense = await db.expenses.get(expenseId);
  if (!expense) return false;
  let parentMutation: OutboxMutation;
  try {
    parentMutation = await normalizeLegacyTravelerMutation({
      ...mutation,
      entityType: "expense",
      entityId: expense.id,
      operation: "insert",
      payload: expense as unknown as Record<string, unknown>,
      baseUpdatedAt: null,
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Cannot sync expense")) return false;
    throw error;
  }
  await TransactionContext.runInTransaction([db.expenses], async (tx) => {
    await append("expense", "insert", parentMutation.payload as unknown as Expense, {
      tx,
      baseUpdatedAt: null,
    });
  });
  return true;
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function travelerIdentity(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.startsWith("traveler:") && isUuid(value.slice("traveler:".length))) return value;
  return isUuid(value) ? value : null;
}

function isRecoverableLegacyMutation(mutation: OutboxMutation): boolean {
  return (
    (mutation.entityType === "expense" || mutation.entityType === "expenseShare") &&
    /invalid input syntax for type uuid|Expense does not exist|Cannot sync expense/.test(
      mutation.lastError ?? ""
    )
  );
}

async function normalizeLegacyTravelerMutation(mutation: OutboxMutation): Promise<OutboxMutation> {
  if (mutation.entityType !== "expense" && mutation.entityType !== "expenseShare") return mutation;
  const payload = mutation.payload ? { ...mutation.payload } : null;
  if (!payload) return mutation;
  const tripId = typeof payload.tripId === "string" ? payload.tripId : mutation.tripId;
  const travelers = await getDb().tripTravelers.where("tripId").equals(tripId).toArray();
  const findTraveler = async (value: unknown) => {
    if (typeof value !== "string") return undefined;
    const identity = value.startsWith("traveler:") ? value.slice("traveler:".length) : value;
    const byId = travelers.find((traveler) => traveler.id === identity);
    if (byId) return byId;
    if (isUuid(identity)) {
      const directMatches = await getDb().tripTravelers.where("id").equals(identity).toArray();
      if (directMatches[0]) return directMatches[0];
    }
    if (travelerIdentity(value)) return undefined;
    return travelers.find(
      (traveler) => traveler.displayName.trim().toLowerCase() === value.trim().toLowerCase()
    );
  };
  let changed = false;
  if (mutation.entityType === "expense") {
    const payerTraveler = await findTraveler(payload.paidBy);
    const knownPayerIdentity =
      travelerIdentity(payload.paidBy) ??
      (isUuid(payload.paidByTravelerId) ? `traveler:${payload.paidByTravelerId}` : null);
    if (payerTraveler) {
      payload.paidBy = `traveler:${payerTraveler.id}`;
      payload.paidByTravelerId = payerTraveler.id;
      changed = true;
    } else if (knownPayerIdentity?.startsWith("traveler:")) {
      payload.paidBy = knownPayerIdentity;
      payload.paidByTravelerId = knownPayerIdentity.slice("traveler:".length);
      changed = true;
    } else if (payload.paidBy !== undefined && payload.paidBy !== null && !isUuid(payload.paidBy)) {
      throw new Error("Cannot sync expense: payer is not a UUID or a saved traveler");
    }
  }
  if (mutation.entityType === "expenseShare") {
    const shareTraveler = await findTraveler(payload.userId);
    const knownShareIdentity =
      travelerIdentity(payload.userId) ??
      (isUuid(payload.travelerId) ? `traveler:${payload.travelerId}` : null);
    if (shareTraveler) {
      payload.userId = `traveler:${shareTraveler.id}`;
      payload.travelerId = shareTraveler.id;
      changed = true;
    } else if (knownShareIdentity?.startsWith("traveler:")) {
      payload.userId = knownShareIdentity;
      payload.travelerId = knownShareIdentity.slice("traveler:".length);
      changed = true;
    } else if (payload.userId !== undefined && payload.userId !== null && !isUuid(payload.userId)) {
      throw new Error("Cannot sync expense share: owner is not a UUID or a saved traveler");
    }
  }
  if (!changed) return mutation;
  if (mutation.entityType === "expense") {
    await getDb().expenses.update(mutation.entityId, {
      paidBy: String(payload.paidBy),
      paidByTravelerId: payload.paidByTravelerId == null ? null : String(payload.paidByTravelerId),
    });
  } else {
    await getDb().expenseShares.update(mutation.entityId, {
      userId: String(payload.userId),
      travelerId: payload.travelerId == null ? null : String(payload.travelerId),
    });
  }
  return { ...mutation, payload };
}

async function resolveCasConflict(
  mutation: OutboxMutation,
  result: CasResult,
  signal?: AbortSignal
): Promise<void> {
  syncDiagnostics.conflictEvents++;
  const remoteUpdatedAt = result.server_updated_at ?? "unknown";
  await recordConflict(mutation, remoteUpdatedAt, "remote");
  await removeMutation(mutation.id);
  await pullRemoteChanges(true, signal);
}

function resolveDeleteRequest(
  client: ReturnType<typeof getSupabaseBrowserClient>,
  mutation: OutboxMutation
) {
  if (mutation.entityType === "vaultKeyset") {
    return client.rpc("sync_vault_keyset_cas_delete", {
      p_id: mutation.entityId,
      p_base_updated_at: mutation.baseUpdatedAt,
    });
  }
  if (mutation.entityType === "vaultEntry") {
    return client.rpc("sync_vault_entry_cas_delete", {
      p_id: mutation.entityId,
      p_base_updated_at: mutation.baseUpdatedAt,
    });
  }
  if (mutation.entityType === "tripShareLink") {
    return client.rpc("sync_trip_share_link_cas_delete", {
      p_id: mutation.entityId,
      p_base_updated_at: mutation.baseUpdatedAt,
    });
  }
  if (mutation.entityType === "activityPersonalBudget") {
    return client.rpc("sync_activity_personal_budget_cas_delete", {
      p_id: mutation.entityId,
      p_base_updated_at: mutation.baseUpdatedAt,
    });
  }
  return client.rpc("sync_cas_delete", {
    p_entity: mutation.entityType,
    p_id: mutation.entityId,
    p_base_updated_at: mutation.baseUpdatedAt,
  });
}

async function replayCasMutation(mutation: OutboxMutation, signal?: AbortSignal): Promise<boolean> {
  if (
    mutation.baseUpdatedAt === undefined ||
    (mutation.operation !== "insert" && mutation.baseUpdatedAt === null)
  ) {
    await resolveCasConflict(mutation, { status: "conflict" }, signal);
    return false;
  }

  const client = getSupabaseBrowserClient();
  const request =
    mutation.operation === "delete"
      ? resolveDeleteRequest(client, mutation)
      : mutation.entityType === "activity"
        ? client.rpc("sync_activity_cas_upsert", {
            p_payload: mutationPayloadToRow(mutation),
            p_base_updated_at: mutation.baseUpdatedAt,
          })
        : mutation.entityType === "activityPersonalBudget"
          ? client.rpc("sync_activity_personal_budget_cas_upsert", {
              p_payload: mutationPayloadToRow(mutation),
              p_base_updated_at: mutation.baseUpdatedAt,
            })
          : mutation.entityType === "contact"
            ? client.rpc("sync_contact_cas_upsert", {
                p_payload: mutationPayloadToRow(mutation),
                p_base_updated_at: mutation.baseUpdatedAt,
              })
            : mutation.entityType === "vaultKeyset"
              ? client.rpc("sync_vault_keyset_cas_upsert", {
                  p_payload: mutationPayloadToRow(mutation),
                  p_base_updated_at: mutation.baseUpdatedAt,
                })
              : mutation.entityType === "vaultEntry"
                ? client.rpc("sync_vault_entry_cas_upsert", {
                    p_payload: mutationPayloadToRow(mutation),
                    p_base_updated_at: mutation.baseUpdatedAt,
                  })
                : mutation.entityType === "connectionRequest" ||
                    mutation.entityType === "connectionResponse"
                  ? client.rpc("sync_connection_cas_upsert", {
                      p_payload: mutationPayloadToRow(mutation),
                      p_base_updated_at: mutation.baseUpdatedAt,
                    })
                  : mutation.entityType === "tripWeatherForecast"
                    ? client.rpc("sync_trip_weather_forecast_cas_upsert", {
                        p_payload: mutationPayloadToRow(mutation),
                        p_base_updated_at: mutation.baseUpdatedAt,
                      })
                    : mutation.entityType === "tripShareLink"
                      ? client.rpc("sync_trip_share_link_cas_upsert", {
                          p_payload: mutationPayloadToRow(mutation),
                          p_base_updated_at: mutation.baseUpdatedAt,
                        })
                      : client.rpc("sync_cas_upsert", {
                          p_entity: mutation.entityType,
                          p_payload: mutationPayloadToRow(mutation),
                          p_base_updated_at: mutation.baseUpdatedAt,
                        });
  let response = signal ? await request.abortSignal(signal) : await request;
  if (
    mutation.entityType === "activity" &&
    response.error &&
    isTransientSchemaCacheError(response.error.message)
  ) {
    const fallback = client.rpc("sync_cas_upsert", {
      p_entity: "activity",
      p_payload: mutationPayloadToRow(mutation),
      p_base_updated_at: mutation.baseUpdatedAt,
    });
    response = signal ? await fallback.abortSignal(signal) : await fallback;
  }
  if (response.error) throw new Error(response.error.message);
  const result = response.data as CasResult;
  if (
    result.status === "conflict" ||
    (result.status === "not_found" && mutation.operation !== "delete")
  ) {
    await resolveCasConflict(mutation, result, signal);
    return false;
  }
  if (mutation.operation !== "delete" && !result.server_updated_at)
    throw new Error("CAS upsert did not return server_updated_at");
  signal?.throwIfAborted();
  await acknowledgeMutation(mutation, result.server_updated_at ?? "");
  signal?.throwIfAborted();
  return true;
}

const EXPENSE_SHARE_MEMBERSHIP_ERROR = "Expense share user must be an active trip member";

function isExpenseShareMembershipError(error: unknown): error is Error {
  return error instanceof Error && error.message.includes(EXPENSE_SHARE_MEMBERSHIP_ERROR);
}

async function replayOne(mutation: OutboxMutation, signal?: AbortSignal) {
  logger.debug("Replaying mutation", {
    id: mutation.id,
    entityType: mutation.entityType,
    operation: mutation.operation,
    entityId: mutation.entityId,
    attempt: mutation.attempts,
  });

  try {
    const normalizedMutation = await normalizeLegacyTravelerMutation(mutation);
    const applied = await replayCasMutation(normalizedMutation, signal);
    if (!applied) return;
    if (
      mutation.entityType === "media" &&
      mutation.payload?.deletedAt &&
      mutation.payload.storagePath
    )
      await deleteRemoteMedia(String(mutation.payload.storagePath), signal);

    logger.debug("Mutation replayed successfully", {
      id: mutation.id,
      entityType: mutation.entityType,
    });
  } catch (error) {
    signal?.throwIfAborted();
    if (isExpenseShareMembershipError(error)) throw error;
    if (error instanceof Error && error.message === "Expense does not exist") {
      if (await requeueMissingExpenseParent(mutation)) {
        await resetMutationAttempts(mutation.id);
        logger.warn("Requeued missing expense parent before retrying expense share", {
          expenseId: mutation.payload?.expenseId,
          mutationId: mutation.id,
        });
      } else {
        await removeMutation(mutation.id);
        logger.warn("Dropped orphaned expense share mutation", {
          expenseId: mutation.payload?.expenseId,
          mutationId: mutation.id,
        });
      }
      return;
    }
    if (error instanceof Error && error.message.startsWith("Cannot sync expense")) {
      await removeMutation(mutation.id);
      logger.warn("Dropped invalid legacy expense mutation", {
        mutationId: mutation.id,
        entityType: mutation.entityType,
      });
      return;
    }
    logger.error(
      "Failed to replay mutation",
      error instanceof Error ? error : new Error(String(error)),
      {
        mutationId: mutation.id,
        entityType: mutation.entityType,
        operation: mutation.operation,
        entityId: mutation.entityId,
        attempt: mutation.attempts,
      }
    );
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

function abortableDelay(delay: number, signal?: AbortSignal): Promise<void> {
  if (!signal) return new Promise((resolve) => setTimeout(resolve, delay));
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, delay);
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener("abort", abort, { once: true });
  });
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
  const pending = sortPendingMutations(await listPendingMutations(syncUser));
  context?.signal.throwIfAborted();

  logger.info("Processing pending mutations", { count: pending.length });

  let successCount = 0;
  let failureCount = 0;
  let skippedCount = 0;

  for (const mutation of pending) {
    context?.signal.throwIfAborted();
    // Check if mutation should be retried
    if (!shouldRetryMutation(mutation)) {
      // Transient PostgREST schema-cache staleness (e.g. migrations applied after
      // the mutation was created) must not permanently drop the mutation. Reset
      // its attempts so it gets a fresh try — the underlying resource exists now.
      if (isRecoverableLegacyMutation(mutation)) {
        await resetMutationAttempts(mutation.id);
        mutation.attempts = 0;
        mutation.lastError = null;
      } else if (isTransientSchemaCacheError(mutation.lastError)) {
        logger.warn("Resetting attempts for schema-cache-stale mutation", {
          id: mutation.id,
          entityType: mutation.entityType,
          attempts: mutation.attempts,
          lastError: mutation.lastError,
        });
        await resetMutationAttempts(mutation.id);
        mutation.attempts = 0;
        mutation.lastError = null;
      } else {
        logger.warn("Skipping mutation that exceeded max retries", {
          id: mutation.id,
          attempts: mutation.attempts,
          entityType: mutation.entityType,
        });
        skippedCount++;
        continue;
      }
    }

    // Apply backoff if this mutation has failed before
    if (mutation.attempts > 0) {
      const delay = getRetryDelay(mutation.attempts);
      logger.debug("Applying backoff for failed mutation", {
        id: mutation.id,
        attempts: mutation.attempts,
        delay,
      });
      await abortableDelay(delay, context?.signal);
    }

    try {
      await replayOne(mutation, context?.signal);
      successCount++;
    } catch (error) {
      context?.signal.throwIfAborted();
      const message = error instanceof Error ? error.message : String(error);
      if (isExpenseShareMembershipError(error)) {
        await blockMutation(mutation.id, message);
        logger.warn("Blocked expense share mutation for manual review", {
          mutationId: mutation.id,
          tripId: mutation.tripId,
          entityId: mutation.entityId,
          shareUserId: mutation.payload?.userId ?? null,
          attempts: mutation.attempts,
        });
        skippedCount++;
        continue;
      }
      logger.error(
        "Mutation failed, marking as failed",
        error instanceof Error ? error : new Error(String(error)),
        {
          mutationId: mutation.id,
          entityType: mutation.entityType,
          attempts: mutation.attempts + 1,
        }
      );
      await markMutationFailed(mutation.id, message);
      failureCount++;
      syncDiagnostics.lastSyncError = message;
    }
  }

  context?.signal.throwIfAborted();
  await processPendingMedia(context?.signal);
  context?.signal.throwIfAborted();
  await pullRemoteChanges(lastSyncAt === null, context?.signal);
  context?.signal.throwIfAborted();
  // Conflicts are auto-resolved during sync (remote wins); clear the historical
  // records so the status pill only reflects actionable conflicts, not a running
  // total of every conflict that ever happened.
  await getDb().syncConflicts.clear();

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

  const newStatus =
    typeof navigator === "undefined" || navigator.onLine
      ? countPending > 0
        ? "error"
        : "idle"
      : "offline";
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
  activeSync = runCoordinatedSync()
    .catch((error) => {
      const cause = error instanceof Error ? error : new Error(String(error));
      syncDiagnostics.lastSyncError = cause.message;
      logger.error("Sync run failed", cause);
      setStatus("error");
      throw cause;
    })
    .finally(() => {
      activeSync = null;
      if (syncRequested) {
        syncRequested = false;
        void runSync().catch(() => undefined);
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

/** Explicit user retry: clear backoff/max-attempt state before replaying. */
export async function retryFailedMutations(): Promise<void> {
  await resetPendingMutationAttempts(getSyncUser());
  await syncNow();
}

export function getSyncState(): {
  status: SyncStatus;
  pending: number;
  retryablePending: number;
  lastSyncAt: string | null;
  lastError: string | null;
} {
  return {
    status,
    pending: countPending,
    retryablePending,
    lastSyncAt,
    lastError: syncDiagnostics.lastSyncError,
  };
}

export function getSyncDiagnostics(): SyncDiagnostics {
  return { ...syncDiagnostics };
}

export function subscribeToSync(
  cb: (
    status: SyncStatus,
    pending: number,
    retryablePending: number,
    lastSyncAt: string | null,
    lastError: string | null
  ) => void
): () => void {
  listeners.push(cb);
  cb(status, countPending, retryablePending, lastSyncAt, syncDiagnostics.lastSyncError);
  return () => {
    const index = listeners.indexOf(cb);
    if (index !== -1) listeners.splice(index, 1);
  };
}

// Exposed for testing.
export const __syncEngineInternals = {
  syncOnce,
  abortableDelay,
  runCoordinatedSync,
  refreshPending,
  replayCasMutation,
  normalizeLegacyTravelerMutation,
  requeueMissingExpenseParent,
  sortPendingMutations,
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
