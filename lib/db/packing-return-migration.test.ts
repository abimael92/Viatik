import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";

import { ViatikDatabase } from "@/lib/db/dexie";

const databaseNames: string[] = [];

afterEach(async () => {
  for (const name of databaseNames.splice(0)) await Dexie.delete(name);
});

describe("packingItems v39 migration", () => {
  it("backfills packedForReturn as false without changing isPacked", async () => {
    const name = `packing-return-${crypto.randomUUID()}`;
    databaseNames.push(name);
    const legacy = new Dexie(name);
    legacy.version(38).stores({
      packingItems: "id, tripId, category, isPacked, [tripId+category], position, updatedAt, deletedAt",
    });
    await legacy.open();
    await legacy.table("packingItems").add({
      id: "item-1",
      tripId: "trip-1",
      category: "gear",
      name: "Adapter",
      quantity: 1,
      isPacked: true,
      isSuggested: false,
      suggestedReason: null,
      position: 0,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      deletedAt: null,
    });
    legacy.close();

    const db = new ViatikDatabase(name);
    try {
      await db.open();
      expect(await db.packingItems.get("item-1")).toEqual(expect.objectContaining({
        isPacked: true,
        packedForReturn: false,
      }));
    } finally {
      db.close();
    }
  });
});
