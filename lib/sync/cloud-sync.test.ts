import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const put = vi.fn();
  const tableGet = vi.fn();
  const tableDelete = vi.fn();
  const metadataGet = vi.fn();
  const metadataPut = vi.fn();
  const outboxDelete = vi.fn();
  const outboxLast = vi.fn();
  const conflictAdd = vi.fn();
  const mediaUpdate = vi.fn();
  const mediaGet = vi.fn();
  const transcriptGet = vi.fn();
  const transcriptPut = vi.fn();
  const transcriptDelete = vi.fn();
  const pendingMedia = vi.fn();
  const feedItemsAdd = vi.fn();
  const feedItemFirst = vi.fn();
  const contactQueryToArray = vi.fn();
  const memberRows = vi.fn();
  const memberDelete = vi.fn();
  const stagedFilter = vi.fn();
  const stagedDraftDelete = vi.fn();
  const contactDelete = vi.fn();
  const outboxAnyOfCount = vi.fn();
  const queryResponses: Array<{ data: Record<string, unknown>[] | null; error: { message: string } | null }> = [];
  const query = {
    lte: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    gt: vi.fn(),
    or: vi.fn(),
    abortSignal: vi.fn(),
    then: (resolve: (value: unknown) => void) => resolve(queryResponses.shift() ?? { data: [], error: null }),
  };
  query.lte.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  query.gt.mockReturnValue(query);
  query.or.mockReturnValue(query);
  query.abortSignal.mockReturnValue(query);
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
    transaction: vi.fn(async (...args: unknown[]) => {
      const work = args.at(-1);
      if (typeof work === "function") await (work as () => Promise<void>)();
    }),
    trips: { toArray: vi.fn().mockResolvedValue([]) },
    syncMetadata: { get: metadataGet, bulkPut: metadataPut },
    outboxMutations: {
      delete: outboxDelete,
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          count: vi.fn().mockResolvedValue(0),
          and: vi.fn(() => ({ last: outboxLast, first: outboxLast, count: outboxAnyOfCount, delete: outboxDelete })),
        })),
        anyOf: vi.fn(() => ({ filter: vi.fn(() => ({ count: outboxAnyOfCount })) })),
      })),
    },
    contacts: {
      where: vi.fn(() => ({
        anyOf: vi.fn(() => ({ filter: vi.fn(() => ({ toArray: contactQueryToArray })) })),
      })),
      delete: contactDelete,
    },
    mediaTranscripts: { get: transcriptGet, put: transcriptPut, delete: transcriptDelete, toArray: vi.fn().mockResolvedValue([]) },
    stagedTripMedia: { where: vi.fn(() => ({ equals: vi.fn(() => ({ filter: stagedFilter.mockReturnValue({ delete: stagedDraftDelete }) })) })) },
    tripMembers: { where: vi.fn(() => ({ equals: vi.fn(() => ({ toArray: memberRows })) })), get: vi.fn(), delete: memberDelete },
    tripMedia: {
      where: vi.fn(() => ({
        anyOf: vi.fn(() => ({ filter: vi.fn((predicate: (media: Record<string, unknown>) => boolean) => ({ toArray: async () => (await pendingMedia()).filter(predicate) })) })),
        equals: vi.fn(() => ({ filter: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })) })),
      })),
      update: mediaUpdate,
      get: mediaGet,
    },
    syncConflicts: { add: conflictAdd },
    feedItems: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({ filter: vi.fn(() => ({ first: feedItemFirst })) })),
      })),
      add: feedItemsAdd,
    },
    table: vi.fn(() => ({ get: tableGet, put, delete: tableDelete })),
  };

  const client = {
    auth: { getUser: vi.fn() },
    rpc,
    from,
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
    storage: { from: storageFrom },
  };

  return { put, tableGet, tableDelete, metadataGet, metadataPut, queryResponses, query, from, upsert, rpc, channel, upload, createSignedUrl, remove, storageFrom, mediaUpdate, mediaGet, transcriptGet, transcriptPut, transcriptDelete, pendingMedia, feedItemsAdd, feedItemFirst, db, client, outboxLast, outboxDelete, conflictAdd, contactQueryToArray, contactDelete, outboxAnyOfCount, memberRows, memberDelete, stagedFilter, stagedDraftDelete };
});

vi.mock("@/lib/db/dexie", () => ({
  getCurrentDatabase: () => mocks.db,
  ViatikDatabase: class {},
}));
vi.mock("@/lib/supabase/browser-client", () => ({ getSupabaseBrowserClient: () => mocks.client }));
vi.mock("@/features/media/data/dexie-media-repository", () => ({ mediaPayload: vi.fn() }));

import { __cloudSyncInternals, processPendingMedia, pullRemoteChanges, resetPendingMediaUploadRetries, startRealtimeSync } from "@/lib/sync/cloud-sync";
import { configureSyncUser } from "@/lib/sync/sync-context";

describe("cloud synchronization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configureSyncUser(null);
    mocks.queryResponses.length = 0;
    mocks.query.lte.mockReturnValue(mocks.query);
    mocks.query.order.mockReturnValue(mocks.query);
    mocks.query.limit.mockReturnValue(mocks.query);
    mocks.query.gt.mockReturnValue(mocks.query);
    mocks.query.or.mockReturnValue(mocks.query);
    mocks.query.abortSignal.mockReturnValue(mocks.query);
    mocks.channel.on.mockReturnValue(mocks.channel);
    mocks.channel.subscribe.mockReturnValue(mocks.channel);
    mocks.client.auth.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mocks.metadataGet.mockResolvedValue(undefined);
    mocks.tableGet.mockResolvedValue(undefined);
    mocks.transcriptGet.mockResolvedValue(undefined);
    mocks.pendingMedia.mockResolvedValue([]);
    mocks.mediaGet.mockImplementation(async (id: string) => (await mocks.pendingMedia()).find((item: { id: string }) => item.id === id));
    mocks.feedItemFirst.mockResolvedValue(undefined);
    mocks.outboxLast.mockResolvedValue(undefined);
    mocks.contactQueryToArray.mockResolvedValue([]);
    mocks.memberRows.mockResolvedValue([]);
    mocks.outboxAnyOfCount.mockResolvedValue(0);
    mocks.upload.mockResolvedValue({ error: null });
    mocks.upsert.mockResolvedValue({ error: null });
    mocks.rpc.mockResolvedValue({ data: { status: "applied", server_updated_at: "2026-01-02T00:00:00.000Z" }, error: null });
    mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://signed.example/photo" }, error: null });
  });

  it("bootstraps every collaborative table and stores a pull cursor", async () => {
    await pullRemoteChanges(true);
    expect(mocks.from).toHaveBeenCalledTimes(24);
    expect(mocks.metadataPut).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ key: "cloud:last-pull:user-1" })]));
  });

  it("pulls media transcripts and maps backend keys into the local store", async () => {
    mocks.queryResponses.push(
      ...Array.from({ length: 23 }, () => ({ data: [], error: null })),
      { data: [{ media_id: "media-1", trip_id: "trip-1", status: "done", text: "Take the second street", language: "en", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-02T00:00:00.000Z", version: 2 }], error: null },
    );

    await pullRemoteChanges(true);

    expect(mocks.from).toHaveBeenLastCalledWith("media_transcripts");
    expect(mocks.query.order).toHaveBeenCalledWith("media_id", { ascending: true });
    expect(mocks.transcriptPut).toHaveBeenCalledWith({
      mediaId: "media-1",
      tripId: "trip-1",
      status: "done",
      text: "Take the second street",
      language: "en",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      version: 2,
    });
  });

  it("uses the stored cursor for incremental pulls", async () => {
    mocks.metadataGet.mockImplementation(async (key: string) => key === "cloud:active-user" ? { key, value: "user-1" } : { key, value: "2026-01-01T00:00:00.000Z" });
    await pullRemoteChanges();
    expect(mocks.query.gt).toHaveBeenCalledTimes(23);
    expect(mocks.query.gt).toHaveBeenCalledWith("updated_at", "2026-01-01T00:00:00.000Z");
  });

  it("purges staged drafts when a full membership snapshot no longer grants local trip access", async () => {
    mocks.memberRows.mockResolvedValue([
      { id: "member-removed", tripId: "trip-1", userId: "user-1", role: "viewer", removedAt: null },
    ]);

    await pullRemoteChanges(true);

    expect(mocks.memberDelete).toHaveBeenCalledWith("member-removed");
    expect(mocks.stagedFilter).toHaveBeenCalledWith(expect.any(Function));
    const ownsDraft = mocks.stagedFilter.mock.calls[0][0] as (draft: { createdBy: string }) => boolean;
    expect(ownsDraft({ createdBy: "user-1" })).toBe(true);
    expect(ownsDraft({ createdBy: "user-2" })).toBe(false);
    expect(mocks.stagedDraftDelete).toHaveBeenCalledOnce();
  });

  it("skips the optional personal-budget table while its migration is absent", async () => {
    mocks.queryResponses.push(
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: null, error: { message: "Could not find the table 'public.activity_personal_budgets' in the schema cache" } },
    );

    await expect(pullRemoteChanges(true)).resolves.toBeUndefined();
    expect(mocks.metadataPut).toHaveBeenCalled();
  });

  it("still fails when a core table is missing from the schema cache", async () => {
    mocks.queryResponses.push({
      data: null,
      error: { message: "Could not find the table 'public.trips' in the schema cache" },
    });

    await expect(pullRemoteChanges(true)).rejects.toThrow("Pull trips");
    expect(mocks.metadataPut).not.toHaveBeenCalled();
  });

  it("propagates ownership cancellation to every PostgREST page request", async () => {
    const controller = new AbortController();

    await pullRemoteChanges(false, controller.signal);

    expect(mocks.query.abortSignal).toHaveBeenCalledTimes(24);
    expect(mocks.query.abortSignal).toHaveBeenCalledWith(controller.signal);
  });

  it("stops before remote requests when ownership is already lost", async () => {
    const controller = new AbortController();
    controller.abort(new Error("lease expired"));

    await expect(pullRemoteChanges(false, controller.signal)).rejects.toThrow("lease expired");

    expect(mocks.from).not.toHaveBeenCalled();
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

  it("downloads trips when the browser reports itself offline", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    mocks.queryResponses.push({
      data: [{ id: "trip-1", owner_id: "user-1", name: "Phoenix Family", updated_at: "2026-01-01T00:00:00.000Z" }],
      error: null,
    });

    try {
      await pullRemoteChanges(true);
      expect(mocks.put).toHaveBeenCalledWith(expect.objectContaining({ id: "trip-1", name: "Phoenix Family" }));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps trips that were already downloaded when a later table fails", async () => {
    mocks.queryResponses.push(
      { data: [{ id: "trip-1", owner_id: "user-1", name: "Phoenix Family", updated_at: "2026-01-01T00:00:00.000Z" }], error: null },
      { data: null, error: { message: "page failed" } },
    );

    await expect(pullRemoteChanges(true)).rejects.toThrow("Pull trip_members: page failed");
    expect(mocks.put).toHaveBeenCalledWith(expect.objectContaining({ id: "trip-1", name: "Phoenix Family" }));
    expect(mocks.metadataPut).not.toHaveBeenCalled();
    expect(mocks.db.transaction).not.toHaveBeenCalled();
  });

  it("converges on a newer remote value and records the conflict", async () => {
    mocks.outboxLast.mockResolvedValue({ id: "mutation-1", entityType: "activity", entityId: "activity-1", tripId: "trip-1", mutatedAt: "2026-01-01T00:00:00.000Z" });
    const activity = { id: "activity-1", tripId: "trip-1", dayDate: "2026-01-02", title: "Remote winner", description: null, location: null, category: "general", startTime: null, endTime: null, position: 1, estimatedCostMinor: null, createdBy: "user-1", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z", deletedAt: null };
    await __cloudSyncInternals.applyRemote("activity", "activities", activity, mocks.client as never);
    expect(mocks.conflictAdd).toHaveBeenCalledWith(expect.objectContaining({ resolution: "remote", entityId: "activity-1" }));
    expect(mocks.outboxDelete).toHaveBeenCalledWith("mutation-1");
    expect(mocks.put).toHaveBeenCalledWith(activity);
  });

  it("sweeps stale local connection edges after a full pull", async () => {
    mocks.contactQueryToArray.mockResolvedValue([
      { id: "conn-1", ownerId: "user-1", connectionId: "conn-1", connectionStatus: "pending", connectionDirection: "outbound", deletedAt: null },
    ]);
    await pullRemoteChanges(true);
    expect(mocks.contactDelete).toHaveBeenCalledWith("conn-1");
  });

  it("spares connection edges with a not-yet-replayed outbox mutation", async () => {
    mocks.contactQueryToArray.mockResolvedValue([
      { id: "conn-2", ownerId: "user-1", connectionId: "conn-2", connectionStatus: "pending", connectionDirection: "outbound", deletedAt: null },
    ]);
    mocks.outboxAnyOfCount.mockResolvedValue(1);
    await pullRemoteChanges(true);
    expect(mocks.contactDelete).not.toHaveBeenCalled();
  });

  it("never queries device-local drafts while processing shared media", async () => {
    configureSyncUser("user-1");
    await processPendingMedia();
    expect(mocks.db.stagedTripMedia.where).not.toHaveBeenCalled();
    configureSyncUser(null);
  });

  it("uploads pending compressed media and marks it complete", async () => {
    configureSyncUser("user-1");
    const blob = new Blob(["photo"], { type: "image/jpeg" });
    mocks.pendingMedia.mockResolvedValue([{ id: "media-1", tripId: "trip-1", activityId: null, caption: null, blob, storagePath: "trip-1/media-1.jpg", uploadedUrl: null, contentType: "image/jpeg", byteSize: blob.size, createdBy: "user-1", uploadStatus: "pending", uploadProgress: 0, uploadError: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", deletedAt: null }]);
    await processPendingMedia();
    expect(mocks.upload).toHaveBeenCalledWith("trip-1/media-1.jpg", blob, expect.objectContaining({ upsert: true }));
    expect(mocks.rpc).toHaveBeenCalledWith("sync_cas_upsert", expect.objectContaining({ p_entity: "media", p_base_updated_at: null }));
    expect(mocks.mediaUpdate).toHaveBeenLastCalledWith("media-1", expect.objectContaining({ uploadStatus: "uploaded", uploadProgress: 100 }));
    configureSyncUser(null);
  });

  it("re-uploads a restored photo and applies its queued compare-and-swap timestamp after the binary", async () => {
    configureSyncUser("user-1");
    const blob = new Blob(["restored photo"], { type: "image/jpeg" });
    const media = { id: "photo-restore", tripId: "trip-1", activityId: null, caption: "Back again", blob, storagePath: "trip-1/photo-restore.jpg", contentType: "image/jpeg", byteSize: blob.size, createdBy: "user-1", uploadStatus: "pending", uploadAttempts: 0, updatedAt: "2026-10-06T00:00:00.000Z", deletedAt: null };
    const mutation = { id: "media-mutation", entityId: media.id, entityType: "media", operation: "update", baseUpdatedAt: "2026-10-05T00:00:00.000Z", revision: 2 };
    mocks.pendingMedia.mockResolvedValue([media]);
    mocks.outboxLast.mockResolvedValue(mutation);

    await processPendingMedia();

    expect(mocks.rpc).toHaveBeenCalledWith("sync_cas_upsert", expect.objectContaining({ p_payload: expect.objectContaining({ id: media.id }), p_base_updated_at: mutation.baseUpdatedAt }));
    expect(mocks.outboxDelete).toHaveBeenCalledWith(mutation.id);
    configureSyncUser(null);
  });

  it("does not sign an unshared upload and leaves the pending tombstone retryable after CAS", async () => {
    configureSyncUser("user-1");
    const blob = new Blob(["photo being unshared"], { type: "image/jpeg" });
    const media = { id: "photo-race", tripId: "trip-1", activityId: null, caption: null, blob, storagePath: "trip-1/photo-race.jpg", contentType: "image/jpeg", byteSize: blob.size, createdBy: "user-1", uploadStatus: "pending", uploadAttempts: 0, updatedAt: "2026-10-06T00:00:00.000Z", deletedAt: null };
    const tombstone = { ...media, deletedAt: "2026-10-07T00:00:00.000Z", uploadedUrl: null };
    const uploadMutation = { id: "upload-mutation", entityId: media.id, entityType: "media", operation: "insert", baseUpdatedAt: null, revision: 1 };
    mocks.pendingMedia.mockResolvedValue([media]);
    mocks.mediaGet.mockResolvedValueOnce(media).mockResolvedValueOnce(tombstone);
    mocks.outboxLast.mockResolvedValue(uploadMutation);

    await processPendingMedia();

    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.mediaGet).toHaveBeenCalledTimes(2);
    expect(mocks.remove).toHaveBeenCalledWith([media.storagePath]);
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
    expect(mocks.mediaUpdate).not.toHaveBeenCalledWith(media.id, expect.objectContaining({ uploadStatus: "uploaded" }));
    expect(mocks.outboxDelete).not.toHaveBeenCalled();
    expect(tombstone.deletedAt).not.toBeNull();
    configureSyncUser(null);
  });

  it("uploads a pending voice clip into the trip audio folder with its kind and duration", async () => {
    configureSyncUser("user-1");
    const blob = new Blob(["voice"], { type: "audio/webm" });
    mocks.pendingMedia.mockResolvedValue([{ id: "media-2", tripId: "trip-1", activityId: null, caption: null, blob, storagePath: "trip-1/audio/media-2.webm", uploadedUrl: null, contentType: "audio/webm", byteSize: blob.size, kind: "audio", durationMs: 4200, createdBy: "user-1", uploadStatus: "pending", uploadProgress: 0, uploadError: null, uploadAttempts: 0, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", deletedAt: null }]);

    await processPendingMedia();

    expect(mocks.upload).toHaveBeenCalledWith("trip-1/audio/media-2.webm", blob, expect.objectContaining({ contentType: "audio/webm", upsert: true }));
    expect(mocks.rpc).toHaveBeenCalledWith("sync_cas_upsert", expect.objectContaining({ p_entity: "media", p_payload: expect.objectContaining({ kind: "audio", duration_ms: 4200 }) }));
    expect(mocks.mediaUpdate).toHaveBeenLastCalledWith("media-2", expect.objectContaining({ uploadStatus: "uploaded" }));
    configureSyncUser(null);
  });

  it("continues retrying a media upload after five failures", async () => {
    configureSyncUser("user-1");
    const blob = new Blob(["voice"], { type: "audio/webm" });
    mocks.pendingMedia.mockResolvedValue([{ id: "media-3", tripId: "trip-1", activityId: null, caption: null, blob, storagePath: "trip-1/audio/media-3.webm", uploadedUrl: null, contentType: "audio/webm", byteSize: blob.size, kind: "audio", durationMs: 4200, createdBy: "user-1", uploadStatus: "failed", uploadProgress: 0, uploadError: "previous failure", uploadAttempts: 5, nextUploadAt: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", deletedAt: null }]);

    await processPendingMedia();

    expect(mocks.upload).toHaveBeenCalledWith("trip-1/audio/media-3.webm", blob, expect.objectContaining({ upsert: true }));
    configureSyncUser(null);
  });

  it("resets failed media retry state on explicit retry", async () => {
    configureSyncUser("user-1");
    mocks.pendingMedia.mockResolvedValue([{ id: "media-4", createdBy: "user-1", uploadAttempts: 5, nextUploadAt: "2026-01-02T00:00:00.000Z" }]);

    await resetPendingMediaUploadRetries();

    expect(mocks.mediaUpdate).toHaveBeenCalledWith("media-4", { uploadAttempts: 0, nextUploadAt: null, uploadError: null });
    configureSyncUser(null);
  });

  it("keeps the author's local voice clip when the uploaded row syncs back", async () => {
    const blob = new Blob(["voice"], { type: "audio/webm" });
    mocks.tableGet.mockResolvedValue({ id: "media-2", tripId: "trip-1", kind: "audio", blob, updatedAt: "2026-01-01T00:00:00.000Z" });
    const remote = { id: "media-2", tripId: "trip-1", activityId: null, caption: null, blob: null, storagePath: "trip-1/audio/media-2.webm", uploadedUrl: null, signedUrlExpiresAt: null, contentType: "audio/webm", byteSize: 5, kind: "audio", durationMs: 4200, createdBy: "user-1", updatedBy: "user-1", deletedBy: null, restoredAt: null, restoredBy: null, version: 1, uploadStatus: "uploaded", uploadProgress: 100, uploadError: null, uploadAttempts: 0, nextUploadAt: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z", deletedAt: null };

    await __cloudSyncInternals.applyRemote("media", "tripMedia", remote as never, mocks.client as never);

    expect(mocks.put).toHaveBeenCalledWith(expect.objectContaining({ id: "media-2", blob, uploadStatus: "uploaded" }));
  });

  it("preserves a locally cached photo Blob when remote metadata merges", async () => {
    const blob = new Blob(["downloaded photo"], { type: "image/jpeg" });
    mocks.tableGet.mockResolvedValue({ id: "photo-1", tripId: "trip-1", kind: "photo", blob, updatedAt: "2026-01-01T00:00:00.000Z" });
    const remote = { id: "photo-1", tripId: "trip-1", activityId: null, kind: "photo", durationMs: null, caption: "Shared", takenAt: null, blob: null, storagePath: "trip-1/photo-1.jpg", uploadedUrl: null, signedUrlExpiresAt: null, contentType: "image/jpeg", byteSize: blob.size, createdBy: "user-2", updatedBy: "user-2", deletedBy: null, restoredAt: null, restoredBy: null, version: 1, uploadStatus: "uploaded", uploadProgress: 100, uploadError: null, uploadAttempts: 0, nextUploadAt: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z", deletedAt: null };

    await __cloudSyncInternals.applyRemote("media", "tripMedia", remote as never, mocks.client as never);

    expect(mocks.put).toHaveBeenCalledWith(expect.objectContaining({ id: "photo-1", blob }));
  });

  it("does not announce a collaborator's voice clip as a photo", async () => {
    configureSyncUser("user-1");
    const remote = { id: "media-3", tripId: "trip-1", activityId: null, caption: null, blob: null, storagePath: "trip-1/audio/media-3.webm", uploadedUrl: null, signedUrlExpiresAt: null, contentType: "audio/webm", byteSize: 5, kind: "audio", durationMs: 1000, createdBy: "user-2", updatedBy: "user-2", deletedBy: null, restoredAt: null, restoredBy: null, version: 1, uploadStatus: "uploaded", uploadProgress: 100, uploadError: null, uploadAttempts: 0, nextUploadAt: null, createdAt: "2026-01-02T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z", deletedAt: null };

    await __cloudSyncInternals.applyRemote("media", "tripMedia", remote as never, mocks.client as never);

    expect(mocks.put).toHaveBeenCalledWith(expect.objectContaining({ id: "media-3", blob: null }));
    expect(mocks.feedItemsAdd).not.toHaveBeenCalled();
    configureSyncUser(null);
  });

  it("subscribes to realtime changes for every table", () => {
    const stop = startRealtimeSync();
    expect(mocks.channel.on).toHaveBeenCalledTimes(24);
    expect(mocks.channel.subscribe).toHaveBeenCalledTimes(2);
    stop();
  });

  it("applies realtime transcript updates to Dexie using media_id as the key", async () => {
    const stop = startRealtimeSync();
    const registration = mocks.channel.on.mock.calls.find((call) => call[1].table === "media_transcripts");
    registration?.[2]({
      eventType: "INSERT",
      old: {},
      new: { media_id: "media-1", trip_id: "trip-1", status: "processing", text: null, language: "es", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-02T00:00:00.000Z", version: 2 },
    });

    await vi.waitFor(() => expect(mocks.transcriptPut).toHaveBeenCalledWith({
      mediaId: "media-1",
      tripId: "trip-1",
      status: "processing",
      text: null,
      language: "es",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      version: 2,
    }));
    stop();
  });

  it("does not overwrite a newer local transcript with a stale realtime row", async () => {
    mocks.transcriptGet.mockResolvedValue({
      mediaId: "media-1",
      tripId: "trip-1",
      status: "done",
      text: "New transcript",
      language: "en",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-03T00:00:00.000Z",
      version: 3,
    });
    const stop = startRealtimeSync();
    const registration = mocks.channel.on.mock.calls.find((call) => call[1].table === "media_transcripts");
    registration?.[2]({
      eventType: "UPDATE",
      old: {},
      new: { media_id: "media-1", trip_id: "trip-1", status: "processing", text: null, language: "en", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-02T00:00:00.000Z", version: 2 },
    });

    await vi.waitFor(() => expect(mocks.transcriptGet).toHaveBeenCalledWith("media-1"));
    expect(mocks.transcriptPut).not.toHaveBeenCalled();
    stop();
  });

  it("keeps a private contact relationship when a connection refresh arrives", async () => {
    configureSyncUser("user-bob");
    mocks.tableGet.mockResolvedValue({ id: "conn-1", relationship: "family", updatedAt: "2026-01-01T00:00:00.000Z" });
    const stop = startRealtimeSync();
    const registration = mocks.channel.on.mock.calls.find((call) => call[1].table === "connections");
    registration?.[2]({
      eventType: "UPDATE",
      old: {},
      new: {
        id: "conn-1",
        requester_id: "user-alice",
        recipient_id: "user-bob",
        status: "accepted",
        requester_snapshot: { profile_id: "user-alice", display_name: "Alice", viatik_id: "VTK-AAAA", avatar_url: null, avatar_seed: null, public_handle: "alice" },
        recipient_snapshot: { profile_id: "user-bob", display_name: "Bob", viatik_id: "VTK-BBBB", avatar_url: null, avatar_seed: null, public_handle: "bob" },
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-02T00:00:00.000Z",
      },
    });
    await vi.waitFor(() => expect(mocks.put).toHaveBeenCalledWith(expect.objectContaining({ id: "conn-1", relationship: "family", fullName: "Alice" })));
    stop();
  });

  it("applies realtime activity updates to the local source of truth", async () => {
    const stop = startRealtimeSync();
    const registration = mocks.channel.on.mock.calls.find((call) => call[1].table === "activities");
    registration?.[2]({ eventType: "UPDATE", old: {}, new: { id: "activity-1", trip_id: "trip-1", day_date: "2026-01-02", title: "Museum", description: null, location: null, category: "culture", start_time: null, end_time: null, position: 1, created_by: "user-1", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-02T00:00:00.000Z", deleted_at: null } });
    await vi.waitFor(() => expect(mocks.put).toHaveBeenCalledWith(expect.objectContaining({ id: "activity-1", title: "Museum" })));
    stop();
  });

  it("broadcasts a collaborator's checklist mutation as a specific shared-feed event", async () => {
    configureSyncUser("user-1");
    mocks.tableGet.mockResolvedValue({
      id: "activity-checklist",
      tripId: "trip-1",
      dayDate: "2026-01-02",
      title: "Museum",
      description: null,
      category: "culture",
      startTime: null,
      endTime: null,
      checklist: [{ id: "task-1", title: "Buy tickets", completed: false, archived: false }],
      position: 1,
      estimatedCostMinor: null,
      createdBy: "user-1",
      updatedBy: "user-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      deletedAt: null,
    });
    const stop = startRealtimeSync();
    const registration = mocks.channel.on.mock.calls.find((call) => call[1].table === "activities");

    registration?.[2]({
      eventType: "UPDATE",
      old: {},
      new: {
        id: "activity-checklist",
        trip_id: "trip-1",
        day_date: "2026-01-02",
        title: "Museum",
        description: null,
        category: "culture",
        start_time: null,
        end_time: null,
        checklist: [{ id: "task-1", title: "Buy tickets", completed: true, archived: false }],
        position: 1,
        created_by: "user-1",
        updated_by: "user-2",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-02T00:00:00.000Z",
        deleted_at: null,
      },
    });

    await vi.waitFor(() => expect(mocks.feedItemsAdd).toHaveBeenCalledTimes(1));
    expect(mocks.feedItemsAdd.mock.calls[0][0]).toEqual(expect.objectContaining({
      actorId: "user-2",
      verb: "completed_checklist_item",
      summary: 'completed “Buy tickets” on “Museum”',
    }));

    configureSyncUser(null);
    stop();
  });

  it("emits a feed entry for a collaborator's realtime change but not our own echo", async () => {
    configureSyncUser("user-1");
    const stop = startRealtimeSync();
    const registration = mocks.channel.on.mock.calls.find((call) => call[1].table === "activities");
    const collaboratorRow = { eventType: "INSERT", old: {}, new: { id: "activity-2", trip_id: "trip-1", day_date: "2026-01-02", title: "Wine tasting", description: null, location: null, category: "food", start_time: null, end_time: null, position: 1, created_by: "user-2", created_at: "2026-01-02T00:00:00.000Z", updated_at: "2026-01-02T00:00:00.000Z", deleted_at: null } };

    registration?.[2](collaboratorRow);
    await vi.waitFor(() => expect(mocks.feedItemsAdd).toHaveBeenCalledTimes(1));
    expect(mocks.feedItemsAdd.mock.calls[0][0]).toEqual(expect.objectContaining({
      tripId: "trip-1",
      actorId: "user-2",
      verb: "added_activity",
      summary: expect.stringContaining("Wine tasting"),
    }));

    // The current user's own change should not be re-emitted (already logged locally).
    const ownRow = { eventType: "INSERT", old: {}, new: { id: "activity-3", trip_id: "trip-1", day_date: "2026-01-02", title: "My walk", description: null, location: null, category: "general", start_time: null, end_time: null, position: 1, created_by: "user-1", created_at: "2026-01-02T00:00:00.000Z", updated_at: "2026-01-02T00:00:00.000Z", deleted_at: null } };
    registration?.[2](ownRow);
    await vi.waitFor(() => expect(mocks.feedItemsAdd).toHaveBeenCalledTimes(1));

    configureSyncUser(null);
    stop();
  });

  it("reconstructs a collaborator settlement feed item from a remote insert", async () => {
    configureSyncUser("user-1");
    mocks.tableGet.mockResolvedValue(undefined);
    const stop = startRealtimeSync();
    const registration = mocks.channel.on.mock.calls.find((call) => call[1].table === "expense_settlements");

    registration?.[2]({
      eventType: "INSERT",
      old: {},
      new: {
        id: "settlement-2",
        trip_id: "trip-1",
        from_user_id: "user-2",
        to_user_id: "user-3",
        amount: "4000",
        currency: "USD",
        date: "2026-09-24",
        created_by: "user-2",
        created_at: "2026-09-24T12:00:00.000Z",
        updated_at: "2026-09-24T12:00:00.000Z",
        deleted_at: null,
      },
    });

    await vi.waitFor(() => expect(mocks.feedItemsAdd).toHaveBeenCalledTimes(1));
    expect(mocks.feedItemsAdd.mock.calls[0][0]).toEqual(expect.objectContaining({
      tripId: "trip-1",
      actorId: "user-2",
      verb: "logged_settlement",
      entityType: "settlement",
      entityId: "settlement-2",
      summary: expect.stringMatching(/paid .* to a traveler/),
    }));

    configureSyncUser(null);
    stop();
  });
});
