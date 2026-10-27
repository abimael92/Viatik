import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";

import { ViatikDatabase } from "@/lib/db/dexie";

const databaseNames: string[] = [];

afterEach(async () => {
  for (const name of databaseNames.splice(0)) await Dexie.delete(name);
});

describe("tripIdeas v48 migration", () => {
  it("backfills travelerContactIds and flightRoute on existing rows", async () => {
    const name = `trip-idea-route-${crypto.randomUUID()}`;
    databaseNames.push(name);
    const legacy = new Dexie(name);
    legacy.version(47).stores({
      tripIdeas: "id, updatedAt, convertedToTripId",
      tripSavingsPlans: "id, &tripIdeaId, updatedAt",
    });
    await legacy.open();
    await legacy.table("tripIdeas").add({
      id: "idea-1",
      name: "Kyoto spring",
      destination: "Kyoto, Japan",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    legacy.close();

    const db = new ViatikDatabase(name);
    try {
      await db.open();
      expect(await db.tripIdeas.get("idea-1")).toEqual(
        expect.objectContaining({
          travelerContactIds: [],
          flightRoute: null,
        })
      );
    } finally {
      db.close();
    }
  });
});
