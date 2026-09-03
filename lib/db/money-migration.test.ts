import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";

import { ViatikDatabase } from "@/lib/db/dexie";

const databaseNames: string[] = [];

afterEach(async () => {
  for (const name of databaseNames.splice(0)) await Dexie.delete(name);
});

describe("money schema migration", () => {
  it("converts legacy expense records and outbox payloads to bigint minor fields", async () => {
    const name = `money-migration-${crypto.randomUUID()}`;
    databaseNames.push(name);
    const legacy = new Dexie(name);
    legacy.version(11).stores({
      expenses: "id",
      expenseShares: "id",
      expenseSettlements: "id",
      outboxMutations: "id",
    });
    await legacy.open();
    await legacy.table("expenses").add({ id: "expense-1", amount: 12345 });
    await legacy.table("expenseShares").add({ id: "share-1", shareAmount: 4567 });
    await legacy.table("expenseSettlements").add({ id: "settlement-1", amount: 1000 });
    await legacy.table("outboxMutations").add({ id: "mutation-1", entityType: "expense", payload: { id: "expense-1", amount: 12345 } });
    legacy.close();

    const db = new ViatikDatabase(name);
    await db.open();

    expect(await db.expenses.get("expense-1")).toEqual({ id: "expense-1", amountMinor: 12345n });
    expect(await db.expenseShares.get("share-1")).toEqual({ id: "share-1", shareAmountMinor: 4567n });
    expect(await db.expenseSettlements.get("settlement-1")).toEqual({ id: "settlement-1", amountMinor: 1000n });
    expect((await db.outboxMutations.get("mutation-1"))?.payload).toEqual({ id: "expense-1", amountMinor: 12345n });
    db.close();
  });

  it("rejects unsafe legacy monetary values instead of rounding", async () => {
    const name = `money-migration-invalid-${crypto.randomUUID()}`;
    databaseNames.push(name);
    const legacy = new Dexie(name);
    legacy.version(11).stores({ expenses: "id", expenseShares: "id", expenseSettlements: "id", outboxMutations: "id" });
    await legacy.open();
    await legacy.table("expenses").add({ id: "expense-1", amount: 12.34 });
    legacy.close();

    const db = new ViatikDatabase(name);
    await expect(db.open()).rejects.toThrow("Cannot migrate invalid amount value");
    db.close();
  });
});
