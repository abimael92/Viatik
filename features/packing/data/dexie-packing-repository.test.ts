import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { deleteDatabase, getDatabase, setCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { configureSyncUser } from "@/lib/sync/sync-context";
import { packingRepository } from "@/features/packing/data/dexie-packing-repository";
import { normalizePackingName } from "@/features/packing/domain/packing-types";

const TEST_USER = "packing-repo-test-user";
const TRIP_ID = "packing-trip-1";

let db: ViatikDatabase;

beforeEach(async () => {
  await deleteDatabase(TEST_USER);
  db = getDatabase(TEST_USER);
  setCurrentDatabase(db);
  configureSyncUser(TEST_USER);
  await db.open();
});

afterEach(async () => {
  await db.close();
});

describe("DexiePackingRepository", () => {
  it("updates quantities and packs or unpacks a category atomically", async () => {
    const first = await packingRepository.addCustom({ tripId: TRIP_ID, category: "gear", name: "Water bottle" });
    const second = await packingRepository.addCustom({ tripId: TRIP_ID, category: "gear", name: "Sunscreen", quantity: 2 });

    await packingRepository.updateQuantity(first.id, 3);
    await packingRepository.setPacked([first.id, second.id], true);

    expect(await db.packingItems.get(first.id)).toEqual(expect.objectContaining({ quantity: 3, isPacked: true }));
    expect(await db.packingItems.get(second.id)).toEqual(expect.objectContaining({ quantity: 2, isPacked: true }));

    await packingRepository.setPacked([first.id, second.id], false);
    expect(await db.packingItems.get(first.id)).toEqual(expect.objectContaining({ isPacked: false }));
    expect(await db.packingItems.get(second.id)).toEqual(expect.objectContaining({ isPacked: false }));
  });

  it("does not add duplicate item names after casing and whitespace normalization", async () => {
    const first = await packingRepository.addCustom({ tripId: TRIP_ID, category: "gear", name: "Sunscreen" });
    const duplicate = await packingRepository.addCustom({ tripId: TRIP_ID, category: "documents", name: " sunscreen " });
    const casingDuplicate = await packingRepository.addCustom({ tripId: TRIP_ID, category: "documents", name: "SUNSCREEN" });
    const internalWhitespace = await packingRepository.addCustom({ tripId: TRIP_ID, category: "documents", name: " Sun  Screen " });

    expect(normalizePackingName(" Sun  Screen ")).toBe("sun screen");
    expect(duplicate.id).toBe(first.id);
    expect(casingDuplicate.id).toBe(first.id);
    expect(internalWhitespace.id).not.toBe(first.id);
    expect(await packingRepository.listByTrip(TRIP_ID)).toHaveLength(2);
  });

  it("deduplicates generated suggestions by item name", async () => {
    await packingRepository.applySuggested(TRIP_ID, [
      { category: "gear", name: "Water bottle", quantity: 1, reason: "always" },
      { category: "electronics", name: "water bottle", quantity: 2, reason: "activity" },
    ]);

    expect(await packingRepository.listByTrip(TRIP_ID)).toHaveLength(1);
  });

  it("preserves custom items, packed state, and adjusted quantities during refresh", async () => {
    const custom = await packingRepository.addCustom({ tripId: TRIP_ID, category: "gear", name: "Sunscreen" });
    await packingRepository.applySuggested(TRIP_ID, [
      { category: "gear", name: "Water bottle", quantity: 1, reason: "always" },
      { category: "gear", name: "Old suggestion", quantity: 1, reason: "activity" },
    ]);
    const suggested = (await packingRepository.listByTrip(TRIP_ID)).find((item) => item.name === "Water bottle")!;
    await packingRepository.updateQuantity(suggested.id, 4);
    await packingRepository.toggle(suggested.id, true);

    await packingRepository.applySuggested(TRIP_ID, [
      { category: "gear", name: "Water bottle", quantity: 1, reason: "always" },
      { category: "gear", name: "New suggestion", quantity: 1, reason: "activity" },
    ]);

    const items = await packingRepository.listByTrip(TRIP_ID);
    expect(items.map((item) => item.name)).toEqual(expect.arrayContaining(["Sunscreen", "Water bottle", "New suggestion"]));
    expect(items.find((item) => item.id === custom.id)).toEqual(expect.objectContaining({ isSuggested: false }));
    expect(items.find((item) => item.name === "Water bottle")).toEqual(expect.objectContaining({ quantity: 4, isPacked: true }));
    expect(items.some((item) => item.name === "Old suggestion")).toBe(false);
  });

  it("resets the list to generated suggestions", async () => {
    await packingRepository.addCustom({ tripId: TRIP_ID, category: "gear", name: "My custom item" });
    await packingRepository.applySuggested(TRIP_ID, [
      { category: "gear", name: "Old suggestion", quantity: 1, reason: "activity" },
    ]);

    await packingRepository.resetToSuggested(TRIP_ID, [
      { category: "documents", name: "Passport / ID", quantity: 1, reason: "always" },
    ]);

    const items = await packingRepository.listByTrip(TRIP_ID);
    expect(items.map((item) => item.name)).toEqual(["Passport / ID"]);
    expect(items[0]?.isSuggested).toBe(true);
  });

  it("rejects invalid quantities", async () => {
    const item = await packingRepository.addCustom({ tripId: TRIP_ID, category: "gear", name: "Hat" });

    await expect(packingRepository.updateQuantity(item.id, 0)).rejects.toThrow("whole number");
    await expect(packingRepository.updateQuantity(item.id, 100)).rejects.toThrow("whole number");
  });
});
