import "fake-indexeddb/auto";

import { Blob as NodeBlob } from "node:buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { stagedTripMediaRepository } from "@/features/media/data/staged-trip-media-repository";
import { buildAudioMedia, mediaPayload, mediaRepository } from "@/features/media/data/dexie-media-repository";
import { configureSyncUser } from "@/lib/sync/sync-context";
import { deleteDatabase, getDatabase, setCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const TRIP_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_TRIP_ID = "44444444-4444-4444-8444-444444444444";
const databaseNames: string[] = [];
let db: ViatikDatabase;

beforeEach(async () => {
  await deleteDatabase(USER_ID);
  db = getDatabase(USER_ID);
  setCurrentDatabase(db);
  configureSyncUser(USER_ID);
  await db.open();
  await db.tripMembers.add({
    id: "member-viewer",
    tripId: TRIP_ID,
    userId: USER_ID,
    role: "viewer",
    invitedBy: OTHER_ID,
    joinedAt: new Date(0).toISOString(),
    roleChangedAt: null,
    roleChangedBy: null,
    removedAt: null,
    removedBy: null,
    version: 1,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  });
});

afterEach(async () => {
  db.close();
  setCurrentDatabase(null);
  configureSyncUser(null);
  await deleteDatabase(USER_ID);
  for (const name of databaseNames.splice(0)) await deleteDatabase(name);
  vi.restoreAllMocks();
});

const newPhoto = (id: string, tripId = TRIP_ID) => ({
  id,
  tripId,
  blob: new NodeBlob([`private ${id}`], { type: "image/jpeg" }) as unknown as Blob,
  caption: `${id}.jpg`,
  takenAt: "2026-10-07",
  createdBy: USER_ID,
});

describe("device-local trip photo staging", () => {
  it("defaults every new shared photo and audio payload to member-only", async () => {
    const photo = await mediaRepository.create(newPhoto("direct-photo"));
    expect(photo.publicGallery).toBe(false);
    expect(mediaPayload(photo).publicGallery).toBe(false);

    const audio = buildAudioMedia({
      id: "audio-1",
      tripId: TRIP_ID,
      createdBy: USER_ID,
      blob: new NodeBlob(["voice"], { type: "audio/webm" }) as unknown as Blob,
      contentType: "audio/webm",
      durationMs: 1000,
      now: new Date(0).toISOString(),
    });
    expect(audio.publicGallery).toBe(false);
    expect(mediaPayload(audio).publicGallery).toBe(false);
  });

  it("stores a viewer's photo privately without feed, outbox, or sync side effects", async () => {
    const dispatch = vi.spyOn(window, "dispatchEvent");
    const staged = await stagedTripMediaRepository.stage(newPhoto("photo-1"));

    expect(staged).toMatchObject({ id: "photo-1", tripId: TRIP_ID, createdBy: USER_ID, byteSize: staged.blob.size });
    db.close();
    await db.open();
    const persisted = await db.stagedTripMedia.get("photo-1");
    expect(persisted).toMatchObject({ id: staged.id, tripId: staged.tripId, caption: staged.caption, byteSize: staged.byteSize });
    expect(persisted?.blob.size).toBe(staged.blob.size);
    expect(await db.tripMedia.count()).toBe(0);
    expect(await db.feedItems.count()).toBe(0);
    expect(await db.outboxMutations.count()).toBe(0);
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: "viatik:sync-request" }));
  });

  it("atomically moves selected drafts into shared media with the same IDs and queues only after commit", async () => {
    await stagedTripMediaRepository.stage(newPhoto("photo-1"));
    await stagedTripMediaRepository.stage(newPhoto("photo-2"));
    const dispatch = vi.spyOn(window, "dispatchEvent");

    const shared = await stagedTripMediaRepository.share(["photo-1"]);

    expect(shared).toHaveLength(1);
    expect(shared[0]).toMatchObject({ id: "photo-1", tripId: TRIP_ID, createdBy: USER_ID, uploadStatus: "pending", publicGallery: false });
    expect(shared[0].blob?.size).toBe(15);
    expect(await db.stagedTripMedia.get("photo-1")).toBeUndefined();
    expect(await db.stagedTripMedia.get("photo-2")).toBeDefined();
    expect(await db.tripMedia.get("photo-1")).toMatchObject({ id: "photo-1", blob: shared[0].blob });
    expect((await db.feedItems.toArray()).filter((item) => item.entityId === "photo-1")).toHaveLength(1);
    expect(await db.outboxMutations.count()).toBe(0);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "viatik:sync-request" }));
  });

  it("unshares only the contributor's photo, preserving its Blob in staging and queueing a metadata tombstone", async () => {
    await stagedTripMediaRepository.stage(newPhoto("photo-1"));
    const [shared] = await stagedTripMediaRepository.share(["photo-1"]);
    await db.outboxMutations.clear();

    await stagedTripMediaRepository.unshare("photo-1");

    expect(await db.stagedTripMedia.get("photo-1")).toMatchObject({ id: "photo-1", blob: shared.blob });
    expect(await db.tripMedia.get("photo-1")).toMatchObject({ deletedAt: expect.any(String) });
    expect(await db.outboxMutations.toArray()).toEqual([
      expect.objectContaining({ entityType: "media", operation: "insert", entityId: "photo-1" }),
    ]);
  });

  it("re-shares an unshared remote photo by restoring the same ID through the pending media pipeline", async () => {
    await stagedTripMediaRepository.stage(newPhoto("photo-1"));
    await stagedTripMediaRepository.share(["photo-1"]);
    await db.tripMedia.update("photo-1", { uploadStatus: "uploaded", updatedAt: "2026-10-07T00:00:00.000Z" });
    await db.outboxMutations.clear();
    await stagedTripMediaRepository.unshare("photo-1");
    const tombstone = await db.tripMedia.get("photo-1");
    await db.outboxMutations.clear();

    const [restored] = await stagedTripMediaRepository.share(["photo-1"]);

    expect(restored).toMatchObject({ id: "photo-1", deletedAt: null, uploadStatus: "pending", publicGallery: false });
    expect(await db.stagedTripMedia.get("photo-1")).toBeUndefined();
    expect(await db.outboxMutations.toArray()).toEqual([
      expect.objectContaining({ entityType: "media", operation: "update", entityId: "photo-1", baseUpdatedAt: tombstone?.updatedAt, payload: expect.objectContaining({ deletedAt: null }) }),
    ]);
  });

  it("rejects staging outside an active local trip membership and rejects unsharing another contributor's photo", async () => {
    await expect(stagedTripMediaRepository.stage(newPhoto("outsider-draft", OTHER_TRIP_ID))).rejects.toThrow(/member/i);
    await stagedTripMediaRepository.stage(newPhoto("photo-1"));
    await stagedTripMediaRepository.share(["photo-1"]);
    configureSyncUser(OTHER_ID);

    await expect(stagedTripMediaRepository.unshare("photo-1")).rejects.toThrow(/contributor/i);
    expect(await db.tripMedia.get("photo-1")).toMatchObject({ deletedAt: null });
  });

  it("purges all staged drafts when local trip access is removed", async () => {
    await stagedTripMediaRepository.stage(newPhoto("photo-1"));
    await stagedTripMediaRepository.stage(newPhoto("photo-2"));

    await stagedTripMediaRepository.purgeTrip(TRIP_ID);

    expect(await db.stagedTripMedia.where("tripId").equals(TRIP_ID).count()).toBe(0);
  });
});
