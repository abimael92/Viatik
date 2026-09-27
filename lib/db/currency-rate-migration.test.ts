import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";

import { ViatikDatabase } from "@/lib/db/dexie";

const databaseNames: string[] = [];

afterEach(async () => {
  for (const name of databaseNames.splice(0)) await Dexie.delete(name);
});

describe("currencyRates v38 migration", () => {
  it("backfills a missing source as default", async () => {
    const name = `currency-rate-migration-${crypto.randomUUID()}`;
    databaseNames.push(name);
    const legacy = new Dexie(name);
    legacy.version(37).stores({
      currencyRates: "id, baseCurrency, quoteCurrency, [baseCurrency+quoteCurrency], updatedAt",
    });
    await legacy.open();
    await legacy.table("currencyRates").add({
      id: "USD:MXN",
      baseCurrency: "USD",
      quoteCurrency: "MXN",
      rate: 17.2,
      fetchedAt: "2026-09-01T00:00:00.000Z",
      expiresAt: null,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    legacy.close();

    const db = new ViatikDatabase(name);
    try {
      await db.open();
      expect((await db.currencyRates.get("USD:MXN"))?.source).toBe("default");
    } finally {
      db.close();
    }
  });
});
