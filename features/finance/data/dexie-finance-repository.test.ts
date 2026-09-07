import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deleteDatabase, getDatabase, setCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { configureSyncUser } from "@/lib/sync/sync-context";
import { removeMutation } from "@/lib/sync/outbox";
import { tripBudgetRepository, userWalletRepository } from "@/features/finance/data/dexie-finance-repository";

const TEST_USER = "finance-repo-test-user";
const TRIP_ID = "00000000-0000-0000-0000-000000000002";

let db: ViatikDatabase;

async function resetDatabase(): Promise<void> {
  for (const table of [db.userWallets, db.tripBudgets, db.outboxMutations]) {
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

describe("DexieTripBudgetRepository", () => {
  it("creates and reads the unified budget for a trip (local-only, no outbox)", async () => {
    const budget = await tripBudgetRepository.upsert({
      id: "budget-1",
      tripId: TRIP_ID,
      totalBudgetMinor: 1000000n,
      createdBy: TEST_USER,
    });

    expect(budget.tripId).toBe(TRIP_ID);
    expect(budget.totalBudgetMinor).toBe(1000000n);
    expect(budget.dailyTargetMinor).toBeNull();
    expect(budget.categoryAllocations).toEqual([]);
    expect(await tripBudgetRepository.getByTrip(TRIP_ID)).toEqual(budget);

    // The unified budget is local-only, so no outbox mutation is enqueued.
    expect(await db.outboxMutations.count()).toBe(0);
  });

  it("upserts in place for an existing trip and stores category allocations", async () => {
    await tripBudgetRepository.upsert({
      id: "budget-1",
      tripId: TRIP_ID,
      totalBudgetMinor: 1000000n,
      createdBy: TEST_USER,
    });

    const updated = await tripBudgetRepository.upsert({
      id: "ignored-id",
      tripId: TRIP_ID,
      totalBudgetMinor: 1500000n,
      dailyTargetMinor: 250000n,
      categoryAllocations: [{ category: "food", allocationMinor: 300000n }],
      createdBy: TEST_USER,
    });

    expect(updated.id).toBe("budget-1");
    expect(updated.totalBudgetMinor).toBe(1500000n);
    expect(updated.dailyTargetMinor).toBe(250000n);
    expect(updated.categoryAllocations).toHaveLength(1);
    expect(updated.categoryAllocations[0].category).toBe("food");
    expect(updated.categoryAllocations[0].allocationMinor).toBe(300000n);
    expect(await db.tripBudgets.where("tripId").equals(TRIP_ID).count()).toBe(1);
  });

  it("patches a single field and removes the budget", async () => {
    const created = await tripBudgetRepository.upsert({
      id: "budget-1",
      tripId: TRIP_ID,
      totalBudgetMinor: 1000000n,
      createdBy: TEST_USER,
    });

    const patched = await tripBudgetRepository.update(created.id, { dailyTargetMinor: 200000n });
    expect(patched.dailyTargetMinor).toBe(200000n);
    expect(patched.totalBudgetMinor).toBe(1000000n);

    await tripBudgetRepository.remove(created.id);
    expect(await tripBudgetRepository.getByTrip(TRIP_ID)).toBeUndefined();
  });
});
