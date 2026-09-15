import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deleteDatabase, getDatabase, setCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { configureSyncUser } from "@/lib/sync/sync-context";
import { shareLinkRepository } from "@/features/sharing/data/dexie-share-repository";

const TEST_USER = "test-share-user";

let db: ViatikDatabase;

beforeEach(async () => {
  await deleteDatabase(TEST_USER);
  db = getDatabase(TEST_USER);
  setCurrentDatabase(db);
  configureSyncUser(TEST_USER);
  await db.open();
  await db.shareLinks.clear();
  await db.outboxMutations.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DexieShareLinkRepository", () => {
  it("creates a link with a unique slug and queues an outbox insert", async () => {
    const link = await shareLinkRepository.create({
      tripId: "trip-1",
      createdBy: TEST_USER,
      label: "Family",
    });

    expect(link.active).toBe(true);
    expect(link.allowItinerary).toBe(true);
    expect(link.label).toBe("Family");
    expect(link.slug.length).toBeGreaterThanOrEqual(8);

    const stored = await db.shareLinks.get(link.id);
    expect(stored).toEqual(link);

    const mutation = await db.outboxMutations
      .where("entityType").equals("tripShareLink")
      .and((m) => m.entityId === link.id)
      .first();
    expect(mutation?.operation).toBe("insert");
    expect(mutation?.payload?.slug).toBe(link.slug);
  });

  it("updates permissions and queues an outbox update", async () => {
    const link = await shareLinkRepository.create({ tripId: "trip-1", createdBy: TEST_USER });

    const updated = await shareLinkRepository.update(link.id, { allowMap: false, active: false });
    expect(updated.allowMap).toBe(false);
    expect(updated.active).toBe(false);

    // The outbox coalesces the pending insert with this update (still one
    // mutation), but the payload must carry the latest state for sync.
    const mutations = await db.outboxMutations
      .where("entityType").equals("tripShareLink")
      .and((m) => m.entityId === link.id)
      .toArray();
    expect(mutations).toHaveLength(1);
    expect(mutations[0].payload?.allowMap).toBe(false);
    expect(mutations[0].payload?.active).toBe(false);
  });

  it("soft-deletes a link and filters it from listings", async () => {
    const link = await shareLinkRepository.create({ tripId: "trip-1", createdBy: TEST_USER });

    await shareLinkRepository.remove(link.id);
    const stored = await db.shareLinks.get(link.id);
    expect(stored?.deletedAt).not.toBeNull();

    expect(await shareLinkRepository.listByTrip("trip-1")).toHaveLength(0);
    expect(await shareLinkRepository.getBySlug(link.slug)).toBeUndefined();
  });

  it("lists non-deleted links for a trip", async () => {
    await shareLinkRepository.create({ tripId: "trip-1", createdBy: TEST_USER });
    const second = await shareLinkRepository.create({ tripId: "trip-1", createdBy: TEST_USER });
    await shareLinkRepository.remove(second.id);

    const links = await shareLinkRepository.listByTrip("trip-1");
    expect(links).toHaveLength(1);
  });
});
