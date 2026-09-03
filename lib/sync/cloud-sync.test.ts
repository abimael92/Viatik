import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const put = vi.fn();
  const tableDelete = vi.fn();
  const metadataGet = vi.fn();
  const metadataPut = vi.fn();
  const outboxDelete = vi.fn();
  const outboxLast = vi.fn();
  const conflictAdd = vi.fn();
  const mediaUpdate = vi.fn();
  const pendingMedia = vi.fn();
  const queryResponses: Array<{ data: Record<string, unknown>[] | null; error: { message: string } | null }> = [];
  const query = {
    lte: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    gt: vi.fn(),
    or: vi.fn(),
    then: (resolve: (value: unknown) => void) => resolve(queryResponses.shift() ?? { data: [], error: null }),
  };
  query.lte.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  query.gt.mockReturnValue(query);
  query.or.mockReturnValue(query);
  const upsert = vi.fn();
  const rpc = vi.fn();
  const from = vi.fn(() => ({ select: vi.fn(() => query), upsert }));
  const channel = { on: vi.fn(), subscribe: vi.fn() };
  channel.on.mockReturnValue(channel);
  channel.subscribe.mockReturnValue(channel);
  const upload = vi.fn();
  const createSignedUrl = vi.fn();
  const remove = vi.fn();
  const storageFrom = vi.fn(() => ({ upload, createSignedUrl, remove }));

  const db = {
    transaction: vi.fn(),
    trips: { toArray: vi.fn().mockResolvedValue([]) },
    syncMetadata: { get: metadataGet, bulkPut: metadataPut },
    outboxMutations: {
      delete: outboxDelete,
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          count: vi.fn().mockResolvedValue(0),
          and: vi.fn(() => ({ last: outboxLast, delete: outboxDelete })),
        })),
      })),
    },
    tripMedia: {
      where: vi.fn(() => ({
        anyOf: vi.fn(() => ({ filter: vi.fn(() => ({ toArray: pendingMedia })) })),
        equals: vi.fn(() => ({ filter: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })) })),
      })),
      update: mediaUpdate,
    },
    syncConflicts: { add: conflictAdd },
    table: vi.fn(() => ({ put, delete: tableDelete })),
  };

  const client = {
    auth: { getUser: vi.fn() },
    rpc,
    from,
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
    storage: { from: storageFrom },
  };

  return { put, tableDelete, metadataGet, metadataPut, queryResponses, query, from, upsert, rpc, channel, upload, createSignedUrl, remove, storageFrom, mediaUpdate, pendingMedia, db, client, outboxLast, outboxDelete, conflictAdd };
});

vi.mock("@/lib/db/dexie", () => ({
  getCurrentDatabase: () => mocks.db,
  ViatikDatabase: class {},
}));
vi.mock("@/lib/supabase/browser-client", () => ({ getSupabaseBrowserClient: () => mocks.client }));
vi.mock("@/features/media/data/dexie-media-repository", () => ({ mediaPayload: vi.fn() }));

import { __cloudSyncInternals, processPendingMedia, pullRemoteChanges, startRealtimeSync } from "@/lib/sync/cloud-sync";

describe("cloud synchronization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryResponses.length = 0;
    mocks.query.lte.mockReturnValue(mocks.query);
    mocks.query.order.mockReturnValue(mocks.query);
    mocks.query.limit.mockReturnValue(mocks.query);
    mocks.query.gt.mockReturnValue(mocks.query);
    mocks.query.or.mockReturnValue(mocks.query);
    mocks.channel.on.mockReturnValue(mocks.channel);
    mocks.channel.subscribe.mockReturnValue(mocks.channel);
    mocks.client.auth.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mocks.metadataGet.mockResolvedValue(undefined);
    mocks.pendingMedia.mockResolvedValue([]);
    mocks.outboxLast.mockResolvedValue(undefined);
    mocks.upload.mockResolvedValue({ error: null });
    mocks.upsert.mockResolvedValue({ error: null });
    mocks.rpc.mockResolvedValue({ data: { status: "applied", server_updated_at: "2026-01-02T00:00:00.000Z" }, error: null });
    mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://signed.example/photo" }, error: null });
  });

  it("bootstraps every collaborative table and stores a pull cursor", async () => {
    await pullRemoteChanges(true);
    expect(mocks.from).toHaveBeenCalledTimes(10);
    expect(mocks.metadataPut).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ key: "cloud:last-pull:user-1" })]));
  });

  it("uses the stored cursor for incremental pulls", async () => {
    mocks.metadataGet.mockImplementation(async (key: string) => key === "cloud:active-user" ? { key, value: "user-1" } : { key, value: "2026-01-01T00:00:00.000Z" });
    await pullRemoteChanges();
    expect(mocks.query.gt).toHaveBeenCalledTimes(10);
    expect(mocks.query.gt).toHaveBeenCalledWith("updated_at", "2026-01-01T00:00:00.000Z");
  });

  it("assembles multiple pages with a composite cursor for equal timestamps", async () => {
    const timestamp = "2026-01-01T00:00:00.000Z";
    const firstPage = Array.from({ length: __cloudSyncInternals.PULL_PAGE_SIZE }, (_, index) => ({ id: `trip-${String(index).padStart(3, "0")}`, updated_at: timestamp }));
    const secondPage = [{ id: "trip-500", updated_at: timestamp }, { id: "trip-501", updated_at: "2026-01-02T00:00:00.000Z" }];
    mocks.queryResponses.push({ data: firstPage, error: null }, { data: secondPage, error: null });

    const rows = await __cloudSyncInternals.fetchTablePages(mocks.client as never, "trips", null, "2026-01-03T00:00:00.000Z");

    expect(rows).toEqual([...firstPage, ...secondPage]);
    expect(mocks.query.order).toHaveBeenCalledWith("updated_at", { ascending: true });
    expect(mocks.query.order).toHaveBeenCalledWith("id", { ascending: true });
    expect(mocks.query.or).toHaveBeenCalledWith(`updated_at.gt.${timestamp},and(updated_at.eq.${timestamp},id.gt.trip-499)`);
  });

  it("requests an empty terminal page when the result matches the page size", async () => {
    const page = Array.from({ length: __cloudSyncInternals.PULL_PAGE_SIZE }, (_, index) => ({ id: `trip-${index}`, updated_at: "2026-01-01T00:00:00.000Z" }));
    mocks.queryResponses.push({ data: page, error: null }, { data: [], error: null });

    await expect(__cloudSyncInternals.fetchTablePages(mocks.client as never, "trips", null, "2026-01-02T00:00:00.000Z")).resolves.toEqual(page);
    expect(mocks.query.limit).toHaveBeenCalledTimes(2);
  });

  it("does not mutate local data or metadata when pagination fails", async () => {
    const page = Array.from({ length: __cloudSyncInternals.PULL_PAGE_SIZE }, (_, index) => ({ id: `member-${index}`, updated_at: "2026-01-01T00:00:00.000Z" }));
    mocks.queryResponses.push({ data: [], error: null }, { data: page, error: null }, { data: null, error: { message: "page failed" } });

    await expect(pullRemoteChanges(true)).rejects.toThrow("Pull trip_members: page failed");
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.db.transaction).not.toHaveBeenCalled();
    expect(mocks.metadataPut).not.toHaveBeenCalled();
  });

  it("converges on a newer remote value and records the conflict", async () => {
    mocks.outboxLast.mockResolvedValue({ id: "mutation-1", entityType: "activity", entityId: "activity-1", tripId: "trip-1", mutatedAt: "2026-01-01T00:00:00.000Z" });
    const activity = { id: "activity-1", tripId: "trip-1", dayDate: "2026-01-02", title: "Remote winner", description: null, location: null, category: "general", startTime: null, endTime: null, position: 1, createdBy: "user-1", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z", deletedAt: null };
    await __cloudSyncInternals.applyRemote("activity", "activities", activity, mocks.client as never);
    expect(mocks.conflictAdd).toHaveBeenCalledWith(expect.objectContaining({ resolution: "remote", entityId: "activity-1" }));
    expect(mocks.outboxDelete).toHaveBeenCalledWith("mutation-1");
    expect(mocks.put).toHaveBeenCalledWith(activity);
  });

  it("uploads pending compressed media and marks it complete", async () => {
    const blob = new Blob(["photo"], { type: "image/jpeg" });
    mocks.pendingMedia.mockResolvedValue([{ id: "media-1", tripId: "trip-1", activityId: null, caption: null, blob, storagePath: "trip-1/media-1.jpg", uploadedUrl: null, contentType: "image/jpeg", byteSize: blob.size, createdBy: "user-1", uploadStatus: "pending", uploadProgress: 0, uploadError: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", deletedAt: null }]);
    await processPendingMedia();
    expect(mocks.upload).toHaveBeenCalledWith("trip-1/media-1.jpg", blob, expect.objectContaining({ upsert: true }));
    expect(mocks.rpc).toHaveBeenCalledWith("sync_cas_upsert", expect.objectContaining({ p_entity: "media", p_base_updated_at: null }));
    expect(mocks.mediaUpdate).toHaveBeenLastCalledWith("media-1", expect.objectContaining({ uploadStatus: "uploaded", uploadProgress: 100 }));
  });

  it("subscribes to realtime changes for every table", () => {
    const stop = startRealtimeSync();
    expect(mocks.channel.on).toHaveBeenCalledTimes(10);
    expect(mocks.channel.subscribe).toHaveBeenCalledOnce();
    stop();
  });

  it("applies realtime activity updates to the local source of truth", async () => {
    const stop = startRealtimeSync();
    const registration = mocks.channel.on.mock.calls.find((call) => call[1].table === "activities");
    registration?.[2]({ eventType: "UPDATE", old: {}, new: { id: "activity-1", trip_id: "trip-1", day_date: "2026-01-02", title: "Museum", description: null, location: null, category: "culture", start_time: null, end_time: null, position: 1, created_by: "user-1", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-02T00:00:00.000Z", deleted_at: null } });
    await vi.waitFor(() => expect(mocks.put).toHaveBeenCalledWith(expect.objectContaining({ id: "activity-1", title: "Museum" })));
    stop();
  });
});
