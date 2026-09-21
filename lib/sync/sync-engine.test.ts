import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OutboxMutation } from "@/lib/sync/types";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  rpcAbortSignal: vi.fn(),
  conflictAdd: vi.fn(),
  mutationDelete: vi.fn(),
  pullRemoteChanges: vi.fn(),
  listPendingMutations: vi.fn(),
  countPendingMutations: vi.fn(),
  countRetryableMutations: vi.fn(),
  markMutationFailed: vi.fn(),
  shouldRetryMutation: vi.fn(),
  isTransientSchemaCacheError: vi.fn(),
  resetMutationAttempts: vi.fn(),
  coordinatorRunExclusive: vi.fn(),
  coordinatorRequestSync: vi.fn(),
  tripTravelersWhere: vi.fn(),
  expenseUpdate: vi.fn(),
  expenseGet: vi.fn(),
  CoordinationInterruptedError: class extends Error {},
}));

vi.mock("@/lib/supabase/browser-client", () => ({
  getSupabaseBrowserClient: () => ({ rpc: mocks.rpc }),
}));
vi.mock("@/lib/db/dexie", () => ({
  getCurrentDatabase: () => ({
    name: "viatik_user-1",
    syncConflicts: { add: mocks.conflictAdd, clear: vi.fn().mockResolvedValue(undefined) },
    outboxMutations: { delete: mocks.mutationDelete },
    expenses: { get: mocks.expenseGet, update: mocks.expenseUpdate },
    expenseShares: { update: mocks.expenseUpdate },
    tripTravelers: { where: mocks.tripTravelersWhere },
    tripMedia: {
      where: () => ({ anyOf: () => ({ filter: () => ({ count: vi.fn().mockResolvedValue(0) }) }) }),
    },
  }),
  ViatikDatabase: class {},
}));
vi.mock("@/lib/sync/cloud-sync", () => ({
  deleteRemoteMedia: vi.fn(),
  processPendingMedia: vi.fn(),
  pullRemoteChanges: mocks.pullRemoteChanges,
  startRealtimeSync: vi.fn(),
}));
vi.mock("@/lib/sync/outbox", () => ({
  acknowledgeMutation: mocks.mutationDelete,
  countPendingMutations: mocks.countPendingMutations,
  countRetryableMutations: mocks.countRetryableMutations,
  listPendingMutations: mocks.listPendingMutations,
  markMutationFailed: mocks.markMutationFailed,
  removeMutation: mocks.mutationDelete,
  shouldRetryMutation: mocks.shouldRetryMutation,
  isTransientSchemaCacheError: mocks.isTransientSchemaCacheError,
  resetMutationAttempts: mocks.resetMutationAttempts,
  getRetryDelay: vi.fn(),
}));
vi.mock("@/lib/sync/sync-coordinator", () => ({
  SyncCoordinationInterruptedError: mocks.CoordinationInterruptedError,
  createBrowserSyncCoordinator: () => ({
    runExclusive: mocks.coordinatorRunExclusive,
    requestSync: mocks.coordinatorRequestSync,
    subscribe: vi.fn(() => vi.fn()),
    close: vi.fn(),
  }),
}));

import { __syncEngineInternals } from "@/lib/sync/sync-engine";
import { configureSyncUser } from "@/lib/sync/sync-context";

function tripMutation(overrides: Partial<OutboxMutation> = {}): OutboxMutation {
  return {
    id: "mutation-1",
    entityType: "trip",
    entityId: "00000000-0000-4000-8000-000000000001",
    tripId: "00000000-0000-4000-8000-000000000001",
    userId: "user-1",
    operation: "update",
    payload: {
      id: "00000000-0000-4000-8000-000000000001",
      ownerId: "00000000-0000-4000-8000-000000000002",
      name: "Paris",
      description: null,
      destination: null,
      startDate: null,
      endDate: null,
      coverImageUrl: null,
      adultCount: 1,
      childCount: 0,
      baseCurrency: "USD",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      deletedAt: null,
    },
    baseUpdatedAt: "2026-01-01T00:00:00.000Z",
    mutatedAt: "2026-01-02T00:00:00.000Z",
    createdAt: "2026-01-02T00:00:00.000Z",
    attempts: 0,
    lastError: null,
    status: "pending",
    ...overrides,
  };
}

describe("CAS mutation replay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mutationDelete.mockResolvedValue(undefined);
    mocks.conflictAdd.mockResolvedValue(undefined);
    mocks.pullRemoteChanges.mockResolvedValue(undefined);
    mocks.listPendingMutations.mockResolvedValue([]);
    mocks.countPendingMutations.mockResolvedValue(0);
    mocks.countRetryableMutations.mockResolvedValue(0);
    mocks.tripTravelersWhere.mockReturnValue({
      equals: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
    });
    mocks.expenseUpdate.mockResolvedValue(1);
    mocks.expenseGet.mockResolvedValue(undefined);
    mocks.shouldRetryMutation.mockReturnValue(true);
    configureSyncUser("user-1");
  });

  it("replays expense parents before their shares", () => {
    const share = tripMutation({ entityType: "expenseShare", entityId: "share-1" });
    const expense = tripMutation({ entityType: "expense", entityId: "expense-1" });

    expect(
      __syncEngineInternals
        .sortPendingMutations([share, expense])
        .map((mutation) => mutation.entityType)
    ).toEqual(["expense", "expenseShare"]);
  });

  it("rejects legacy expense payers that are not UUIDs before the RPC boundary", async () => {
    const mutation = tripMutation({
      entityType: "expense",
      payload: { paidBy: "dude", tripId: "trip-1" },
    });

    await expect(__syncEngineInternals.normalizeLegacyTravelerMutation(mutation)).rejects.toThrow(
      "payer is not a UUID or a saved traveler"
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("normalizes a legacy traveler name and persists the repaired identity locally", async () => {
    mocks.tripTravelersWhere.mockReturnValue({
      equals: vi.fn().mockReturnValue({
        toArray: vi
          .fn()
          .mockResolvedValue([{ id: "00000000-0000-4000-8000-000000000099", displayName: "Dude" }]),
      }),
    });
    const mutation = tripMutation({
      entityType: "expense",
      entityId: "expense-1",
      payload: { paidBy: "dude", tripId: "trip-1" },
    });

    const normalized = await __syncEngineInternals.normalizeLegacyTravelerMutation(mutation);

    expect(normalized.payload).toEqual(
      expect.objectContaining({
        paidBy: "traveler:00000000-0000-4000-8000-000000000099",
        paidByTravelerId: "00000000-0000-4000-8000-000000000099",
      })
    );
    expect(mocks.expenseUpdate).toHaveBeenCalledWith("expense-1", {
      paidBy: "traveler:00000000-0000-4000-8000-000000000099",
      paidByTravelerId: "00000000-0000-4000-8000-000000000099",
    });
  });

  it("normalizes a legacy traveler UUID in an expense share", async () => {
    const travelerId = "00000000-0000-4000-8000-000000000099";
    mocks.tripTravelersWhere.mockReturnValue({
      equals: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([{ id: travelerId, displayName: "Dude" }]),
      }),
    });
    const mutation = tripMutation({
      entityType: "expenseShare",
      entityId: "share-1",
      payload: { expenseId: "expense-1", tripId: "trip-1", userId: travelerId, travelerId: null },
    });

    const normalized = await __syncEngineInternals.normalizeLegacyTravelerMutation(mutation);

    expect(normalized.payload).toEqual(
      expect.objectContaining({
        userId: `traveler:${travelerId}`,
        travelerId,
      })
    );
    expect(mocks.expenseUpdate).toHaveBeenCalledWith("share-1", {
      userId: `traveler:${travelerId}`,
      travelerId,
    });
  });

  it("does not requeue a share when its local expense has an invalid legacy payer", async () => {
    mocks.expenseGet.mockResolvedValue({ id: "expense-1", tripId: "trip-1", paidBy: "dude" });
    const share = tripMutation({
      entityType: "expenseShare",
      entityId: "share-1",
      payload: {
        expenseId: "expense-1",
        tripId: "trip-1",
        userId: "00000000-0000-4000-8000-000000000002",
      },
    });

    await expect(__syncEngineInternals.requeueMissingExpenseParent(share)).resolves.toBe(false);
    expect(mocks.expenseUpdate).not.toHaveBeenCalled();
  });

  it("reads pending mutations only after coordination ownership is granted", async () => {
    mocks.coordinatorRunExclusive.mockImplementation(async (_scope, operation) => ({
      acquired: true,
      value: await operation(),
    }));

    await __syncEngineInternals.runCoordinatedSync();

    expect(mocks.coordinatorRunExclusive).toHaveBeenCalledWith(
      { databaseName: "viatik_user-1", userId: "user-1" },
      expect.any(Function)
    );
    expect(mocks.listPendingMutations).toHaveBeenCalledWith("user-1");
  });

  it("lets follower tabs yield without reading or replaying the outbox", async () => {
    mocks.coordinatorRunExclusive.mockResolvedValue({ acquired: false });

    await __syncEngineInternals.runCoordinatedSync();

    expect(mocks.listPendingMutations).not.toHaveBeenCalled();
    expect(mocks.coordinatorRequestSync).not.toHaveBeenCalled();
  });

  it("treats lost coordination as a graceful yield", async () => {
    mocks.coordinatorRunExclusive.mockRejectedValue(
      new mocks.CoordinationInterruptedError("lease lost")
    );

    await expect(__syncEngineInternals.runCoordinatedSync()).resolves.toBeUndefined();

    expect(mocks.listPendingMutations).not.toHaveBeenCalled();
    expect(mocks.countPendingMutations).toHaveBeenCalledWith("user-1");
  });

  it("cancels retry delays when the tab loses ownership", async () => {
    const controller = new AbortController();
    const delay = __syncEngineInternals.abortableDelay(60_000, controller.signal);

    controller.abort(new mocks.CoordinationInterruptedError("tab closed"));

    await expect(delay).rejects.toThrow("tab closed");
  });

  it("stops in-flight replay without incrementing retries when its tab closes", async () => {
    const controller = new AbortController();
    const mutation = tripMutation();
    mocks.listPendingMutations.mockResolvedValue([mutation]);
    mocks.rpc.mockReturnValue({ abortSignal: mocks.rpcAbortSignal });
    mocks.rpcAbortSignal.mockImplementation(
      (signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        })
    );
    mocks.coordinatorRunExclusive.mockImplementation(async (_scope, operation) => ({
      acquired: true,
      value: await operation({ signal: controller.signal }),
    }));

    const sync = __syncEngineInternals.runCoordinatedSync();
    await vi.waitFor(() => expect(mocks.rpcAbortSignal).toHaveBeenCalledWith(controller.signal));
    controller.abort(new mocks.CoordinationInterruptedError("tab closed"));
    await expect(sync).resolves.toBeUndefined();

    expect(mocks.markMutationFailed).not.toHaveBeenCalled();
    expect(mocks.mutationDelete).not.toHaveBeenCalled();
  });

  it("sends the server-derived base version to the upsert RPC", async () => {
    mocks.rpc.mockResolvedValue({
      data: { status: "applied", server_updated_at: "2026-01-03T00:00:00.000Z" },
      error: null,
    });
    const mutation = tripMutation();

    await expect(__syncEngineInternals.replayCasMutation(mutation)).resolves.toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "sync_cas_upsert",
      expect.objectContaining({ p_entity: "trip", p_base_updated_at: mutation.baseUpdatedAt })
    );
    expect(mocks.pullRemoteChanges).not.toHaveBeenCalled();
  });

  it("falls back to generic CAS when the activity insert RPC is missing from the schema cache", async () => {
    mocks.isTransientSchemaCacheError.mockReturnValue(true);
    mocks.rpc
      .mockResolvedValueOnce({
        data: null,
        error: {
          message:
            "Could not find the function public.sync_activity_cas_upsert(p_base_updated_at, p_payload) in the schema cache",
        },
      })
      .mockResolvedValueOnce({
        data: { status: "applied", server_updated_at: "2026-01-03T00:00:00.000Z" },
        error: null,
      });
    const mutation = tripMutation({
      entityType: "activity",
      operation: "insert",
      baseUpdatedAt: null,
      payload: {
        id: "00000000-0000-4000-8000-000000000003",
        tripId: "00000000-0000-4000-8000-000000000001",
        dayDate: "2026-01-03",
        title: "Museum",
        description: null,
        category: "sightseeing",
        startTime: null,
        endTime: null,
        position: 1,
        estimatedCostMinor: null,
        createdBy: "00000000-0000-4000-8000-000000000002",
        createdAt: "2026-01-02T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
        deletedAt: null,
      },
    });

    await expect(__syncEngineInternals.replayCasMutation(mutation)).resolves.toBe(true);
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      1,
      "sync_activity_cas_upsert",
      expect.objectContaining({ p_base_updated_at: null })
    );
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      2,
      "sync_cas_upsert",
      expect.objectContaining({ p_entity: "activity", p_base_updated_at: null })
    );
    expect(mocks.mutationDelete).toHaveBeenCalledWith(mutation, "2026-01-03T00:00:00.000Z");
  });

  it("falls back to generic CAS for activity updates when the specialized RPC is stale", async () => {
    mocks.isTransientSchemaCacheError.mockReturnValue(true);
    mocks.rpc
      .mockResolvedValueOnce({ data: null, error: { message: "Could not find the function public.sync_activity_cas_upsert(...) in the schema cache" } })
      .mockResolvedValueOnce({ data: { status: "applied", server_updated_at: "2026-01-03T00:00:00.000Z" }, error: null });
    const mutation = tripMutation({
      entityType: "activity",
      operation: "update",
      baseUpdatedAt: "2026-01-02T00:00:00.000Z",
      payload: {
        id: "00000000-0000-4000-8000-000000000003",
        tripId: "00000000-0000-4000-8000-000000000001",
        dayDate: "2026-01-03",
        title: "Museum",
        description: null,
        category: "sightseeing",
        startTime: null,
        endTime: null,
        position: 1,
        estimatedCostMinor: null,
        createdBy: "00000000-0000-4000-8000-000000000002",
        createdAt: "2026-01-02T00:00:00.000Z",
        updatedAt: "2026-01-03T00:00:00.000Z",
        deletedAt: null,
      },
    });

    await expect(__syncEngineInternals.replayCasMutation(mutation)).resolves.toBe(true);
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "sync_cas_upsert", expect.objectContaining({ p_entity: "activity" }));
  });

  it("resets attempts for mutations stuck on a transient schema-cache error", async () => {
    mocks.rpc.mockResolvedValue({
      data: { status: "applied", server_updated_at: "2026-01-03T00:00:00.000Z" },
      error: null,
    });
    const mutation = tripMutation({
      attempts: 5,
      lastError: 'record "new" has no field "updated_by"',
    });
    mocks.listPendingMutations.mockResolvedValue([mutation]);
    mocks.shouldRetryMutation.mockReturnValue(false);
    mocks.isTransientSchemaCacheError.mockReturnValue(true);
    mocks.coordinatorRunExclusive.mockImplementation(async (_scope, operation) => ({
      acquired: true,
      value: await operation(),
    }));

    await __syncEngineInternals.runCoordinatedSync();

    expect(mocks.resetMutationAttempts).toHaveBeenCalledWith("mutation-1");
    expect(mocks.rpc).toHaveBeenCalled();
  });

  it("recovers and drops an exhausted invalid legacy expense mutation", async () => {
    const mutation = tripMutation({
      entityType: "expense",
      attempts: 5,
      lastError: 'invalid input syntax for type uuid: "dude"',
      payload: { paidBy: "dude", tripId: "trip-1" },
    });
    mocks.listPendingMutations.mockResolvedValue([mutation]);
    mocks.shouldRetryMutation.mockReturnValue(false);
    mocks.isTransientSchemaCacheError.mockReturnValue(false);
    mocks.coordinatorRunExclusive.mockImplementation(async (_scope, operation) => ({
      acquired: true,
      value: await operation(),
    }));

    await expect(__syncEngineInternals.runCoordinatedSync()).resolves.toBeUndefined();

    expect(mocks.resetMutationAttempts).toHaveBeenCalledWith(mutation.id);
    expect(mocks.mutationDelete).toHaveBeenCalledWith(mutation.id);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("skips (does not reset) mutations that exceeded retries for non-transient errors", async () => {
    const mutation = tripMutation({ attempts: 5, lastError: "some persistent error" });
    mocks.listPendingMutations.mockResolvedValue([mutation]);
    mocks.shouldRetryMutation.mockReturnValue(false);
    mocks.isTransientSchemaCacheError.mockReturnValue(false);
    mocks.coordinatorRunExclusive.mockImplementation(async (_scope, operation) => ({
      acquired: true,
      value: await operation(),
    }));

    await __syncEngineInternals.runCoordinatedSync();

    expect(mocks.resetMutationAttempts).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("propagates ownership cancellation to the mutation RPC", async () => {
    const controller = new AbortController();
    mocks.rpcAbortSignal.mockResolvedValue({
      data: { status: "applied", server_updated_at: "2026-01-03T00:00:00.000Z" },
      error: null,
    });
    mocks.rpc.mockReturnValue({ abortSignal: mocks.rpcAbortSignal });
    const mutation = tripMutation();

    await expect(
      __syncEngineInternals.replayCasMutation(mutation, controller.signal)
    ).resolves.toBe(true);

    expect(mocks.rpcAbortSignal).toHaveBeenCalledWith(controller.signal);
  });

  it("records a conflict, removes the mutation, and refreshes server state", async () => {
    mocks.rpc.mockResolvedValue({
      data: { status: "conflict", server_updated_at: "2026-01-03T00:00:00.000Z" },
      error: null,
    });
    const mutation = tripMutation();

    await expect(__syncEngineInternals.replayCasMutation(mutation)).resolves.toBe(false);
    expect(mocks.conflictAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: mutation.entityId,
        remoteUpdatedAt: "2026-01-03T00:00:00.000Z",
        resolution: "remote",
      })
    );
    expect(mocks.mutationDelete).toHaveBeenCalledWith(mutation.id);
    expect(mocks.pullRemoteChanges).toHaveBeenCalledWith(true, undefined);
  });

  it("treats a legacy mutation without a base version as a conflict without calling the RPC", async () => {
    const mutation = tripMutation({ baseUpdatedAt: undefined });

    await expect(__syncEngineInternals.replayCasMutation(mutation)).resolves.toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.mutationDelete).toHaveBeenCalledWith(mutation.id);
    expect(mocks.pullRemoteChanges).toHaveBeenCalledWith(true, undefined);
  });

  it("leaves retry handling to the outbox when the RPC fails", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "network failed" } });
    const mutation = tripMutation();

    await expect(__syncEngineInternals.replayCasMutation(mutation)).rejects.toThrow(
      "network failed"
    );
    expect(mocks.mutationDelete).not.toHaveBeenCalled();
    expect(mocks.pullRemoteChanges).not.toHaveBeenCalled();
  });

  it("treats an absent hard-delete target as idempotently applied", async () => {
    mocks.rpc.mockResolvedValue({ data: { status: "not_found" }, error: null });
    const mutation = tripMutation({ entityType: "tripMember", operation: "delete", payload: null });

    await expect(__syncEngineInternals.replayCasMutation(mutation)).resolves.toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "sync_cas_delete",
      expect.objectContaining({
        p_id: mutation.entityId,
        p_base_updated_at: mutation.baseUpdatedAt,
      })
    );
  });
});
