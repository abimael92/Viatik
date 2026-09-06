import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deleteDatabase, getDatabase, setCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { configureSyncUser } from "@/lib/sync/sync-context";
import { removeMutation } from "@/lib/sync/outbox";
import { dailyBudgetOverrideRepository, userWalletRepository } from "@/features/finance/data/dexie-finance-repository";

const TEST_USER = "finance-repo-test-user";
const TRIP_ID = "00000000-0000-0000-0000-000000000002";

let db: ViatikDatabase;

async function resetDatabase(): Promise<void> {
  for (const table of [db.userWallets, db.dailyBudgetOverrides, db.outboxMutations]) {
    await table.clear();
  }
}

beforeEach(async () => {
  await deleteDatabase(TEST_USER);
  db = getDatabase(TEST_USER);
  setCurrentDatabase(db);
  configureSyncUser(TEST_USER);
  await db.open();
  await resetDatabase();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DexieUserWalletRepository", () => {
  it("creates a wallet and enqueues an insert outbox mutation", async () => {
    const wallet = await userWalletRepository.upsert({
      id: "wallet-1",
      tripId: TRIP_ID,
      userId: TEST_USER,
      startingBalanceMinor: 100000n,
      currency: "USD",
    });

    expect(wallet.tripId).toBe(TRIP_ID);
    expect(wallet.userId).toBe(TEST_USER);
    expect(wallet.startingBalanceMinor).toBe(100000n);
    expect(await db.userWallets.get("wallet-1")).toEqual(wallet);

    const pending = await db.outboxMutations.where("entityType").equals("userWallet").toArray();
    expect(pending).toHaveLength(1);
    expect(pending[0].operation).toBe("insert");
    expect(pending[0].tripId).toBe(TRIP_ID);
  });

  it("upserts in place for an existing (tripId, userId) pair", async () => {
    await userWalletRepository.upsert({ id: "wallet-1", tripId: TRIP_ID, userId: TEST_USER, startingBalanceMinor: 100000n, currency: "USD" });
    const inserted = await db.outboxMutations.where("entityType").equals("userWallet").first();
    await removeMutation(inserted!.id);

    const updated = await userWalletRepository.upsert({ id: "ignored-id", tripId: TRIP_ID, userId: TEST_USER, startingBalanceMinor: 250000n, currency: "EUR" });

    expect(updated.id).toBe("wallet-1");
    expect(updated.startingBalanceMinor).toBe(250000n);
    expect(updated.currency).toBe("EUR");
    expect(await db.userWallets.where("[tripId+userId]").equals([TRIP_ID, TEST_USER]).count()).toBe(1);

    const pending = await db.outboxMutations.where("entityType").equals("userWallet").toArray();
    expect(pending).toHaveLength(1);
    expect(pending[0].operation).toBe("update");
  });

  it("coalesces a pending wallet insert when updated before sync", async () => {
    await userWalletRepository.upsert({ id: "wallet-1", tripId: TRIP_ID, userId: TEST_USER, startingBalanceMinor: 100000n, currency: "USD" });
    await userWalletRepository.upsert({ id: "ignored-id", tripId: TRIP_ID, userId: TEST_USER, startingBalanceMinor: 250000n, currency: "EUR" });

    const pending = await db.outboxMutations.where("entityType").equals("userWallet").toArray();
    expect(pending).toHaveLength(1);
    expect(pending[0].operation).toBe("insert");
    expect((pending[0].payload as { startingBalanceMinor: bigint }).startingBalanceMinor).toBe(250000n);
  });
});

describe("DexieDailyBudgetOverrideRepository", () => {
  it("creates and reads an override by trip and date", async () => {
    const override = await dailyBudgetOverrideRepository.upsert({
      id: "override-1",
      tripId: TRIP_ID,
      date: "2026-09-03",
      customBudgetAmountMinor: 75000n,
    });

    expect(override.date).toBe("2026-09-03");
    expect(await dailyBudgetOverrideRepository.getByDate(TRIP_ID, "2026-09-03")).toEqual(override);

    const pending = await db.outboxMutations.where("entityType").equals("dailyBudgetOverride").toArray();
    expect(pending).toHaveLength(1);
    expect(pending[0].operation).toBe("insert");
  });

  it("updates an existing override and enqueues an update mutation", async () => {
    await dailyBudgetOverrideRepository.upsert({ id: "override-1", tripId: TRIP_ID, date: "2026-09-03", customBudgetAmountMinor: 75000n });
    const inserted = await db.outboxMutations.where("entityType").equals("dailyBudgetOverride").first();
    await removeMutation(inserted!.id);

    const updated = await dailyBudgetOverrideRepository.upsert({ id: "ignored-id", tripId: TRIP_ID, date: "2026-09-03", customBudgetAmountMinor: 90000n });

    expect(updated.id).toBe("override-1");
    expect(updated.customBudgetAmountMinor).toBe(90000n);
    const pending = await db.outboxMutations.where("entityType").equals("dailyBudgetOverride").toArray();
    expect(pending).toHaveLength(1);
    expect(pending[0].operation).toBe("update");
  });

  it("removes an override and enqueues a delete mutation", async () => {
    await dailyBudgetOverrideRepository.upsert({ id: "override-1", tripId: TRIP_ID, date: "2026-09-03", customBudgetAmountMinor: 75000n });
    const inserted = await db.outboxMutations.where("entityType").equals("dailyBudgetOverride").first();
    await removeMutation(inserted!.id);

    await dailyBudgetOverrideRepository.remove("override-1");

    expect(await dailyBudgetOverrideRepository.getByDate(TRIP_ID, "2026-09-03")).toBeUndefined();
    const pending = await db.outboxMutations.where("entityType").equals("dailyBudgetOverride").toArray();
    expect(pending).toHaveLength(1);
    expect(pending[0].operation).toBe("delete");
  });
});
