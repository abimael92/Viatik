import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OutboxMutation } from "@/lib/sync/types";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  conflictAdd: vi.fn(),
  mutationDelete: vi.fn(),
  pullRemoteChanges: vi.fn(),
  listPendingMutations: vi.fn(),
  countPendingMutations: vi.fn(),
  coordinatorRunExclusive: vi.fn(),
  coordinatorRequestSync: vi.fn(),
  CoordinationInterruptedError: class extends Error {},
}));

vi.mock("@/lib/supabase/browser-client", () => ({ getSupabaseBrowserClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/db/dexie", () => ({
  getCurrentDatabase: () => ({
    name: "viatik_user-1",
    syncConflicts: { add: mocks.conflictAdd },
    outboxMutations: { delete: mocks.mutationDelete },
    tripMedia: { where: () => ({ anyOf: () => ({ filter: () => ({ count: vi.fn().mockResolvedValue(0) }) }) }) },
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
  listPendingMutations: mocks.listPendingMutations,
  markMutationFailed: vi.fn(),
  removeMutation: mocks.mutationDelete,
  shouldRetryMutation: vi.fn(),
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
    configureSyncUser("user-1");
  });

  it("reads pending mutations only after coordination ownership is granted", async () => {
    mocks.coordinatorRunExclusive.mockImplementation(async (_scope, operation) => ({ acquired: true, value: await operation() }));

    await __syncEngineInternals.runCoordinatedSync();

    expect(mocks.coordinatorRunExclusive).toHaveBeenCalledWith({ databaseName: "viatik_user-1", userId: "user-1" }, expect.any(Function));
    expect(mocks.listPendingMutations).toHaveBeenCalledWith("user-1");
  });

  it("lets follower tabs yield without reading or replaying the outbox", async () => {
    mocks.coordinatorRunExclusive.mockResolvedValue({ acquired: false });

    await __syncEngineInternals.runCoordinatedSync();

    expect(mocks.listPendingMutations).not.toHaveBeenCalled();
    expect(mocks.coordinatorRequestSync).not.toHaveBeenCalled();
  });

  it("treats lost coordination as a graceful yield", async () => {
    mocks.coordinatorRunExclusive.mockRejectedValue(new mocks.CoordinationInterruptedError("lease lost"));

    await expect(__syncEngineInternals.runCoordinatedSync()).resolves.toBeUndefined();

    expect(mocks.listPendingMutations).not.toHaveBeenCalled();
    expect(mocks.countPendingMutations).toHaveBeenCalledWith("user-1");
  });

  it("sends the server-derived base version to the upsert RPC", async () => {
    mocks.rpc.mockResolvedValue({ data: { status: "applied", server_updated_at: "2026-01-03T00:00:00.000Z" }, error: null });
    const mutation = tripMutation();

    await expect(__syncEngineInternals.replayCasMutation(mutation)).resolves.toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("sync_cas_upsert", expect.objectContaining({ p_entity: "trip", p_base_updated_at: mutation.baseUpdatedAt }));
    expect(mocks.pullRemoteChanges).not.toHaveBeenCalled();
  });

  it("records a conflict, removes the mutation, and refreshes server state", async () => {
    mocks.rpc.mockResolvedValue({ data: { status: "conflict", server_updated_at: "2026-01-03T00:00:00.000Z" }, error: null });
    const mutation = tripMutation();

    await expect(__syncEngineInternals.replayCasMutation(mutation)).resolves.toBe(false);
    expect(mocks.conflictAdd).toHaveBeenCalledWith(expect.objectContaining({ entityId: mutation.entityId, remoteUpdatedAt: "2026-01-03T00:00:00.000Z", resolution: "remote" }));
    expect(mocks.mutationDelete).toHaveBeenCalledWith(mutation.id);
    expect(mocks.pullRemoteChanges).toHaveBeenCalledWith(true);
  });

  it("treats a legacy mutation without a base version as a conflict without calling the RPC", async () => {
    const mutation = tripMutation({ baseUpdatedAt: undefined });

    await expect(__syncEngineInternals.replayCasMutation(mutation)).resolves.toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.mutationDelete).toHaveBeenCalledWith(mutation.id);
    expect(mocks.pullRemoteChanges).toHaveBeenCalledWith(true);
  });

  it("leaves retry handling to the outbox when the RPC fails", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "network failed" } });
    const mutation = tripMutation();

    await expect(__syncEngineInternals.replayCasMutation(mutation)).rejects.toThrow("network failed");
    expect(mocks.mutationDelete).not.toHaveBeenCalled();
    expect(mocks.pullRemoteChanges).not.toHaveBeenCalled();
  });

  it("treats an absent hard-delete target as idempotently applied", async () => {
    mocks.rpc.mockResolvedValue({ data: { status: "not_found" }, error: null });
    const mutation = tripMutation({ entityType: "tripMember", operation: "delete", payload: null });

    await expect(__syncEngineInternals.replayCasMutation(mutation)).resolves.toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("sync_cas_delete", expect.objectContaining({ p_id: mutation.entityId, p_base_updated_at: mutation.baseUpdatedAt }));
  });
});
