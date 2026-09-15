import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";

import { activityPersonalBudgetRepository } from "@/features/activities/data/dexie-activity-personal-budget-repository";
import { deleteDatabase, getDatabase, setCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { configureSyncUser } from "@/lib/sync/sync-context";

const TEST_USER = "personal-budget-user";
let db: ViatikDatabase;

beforeEach(async () => {
  await deleteDatabase(TEST_USER);
  db = getDatabase(TEST_USER);
  setCurrentDatabase(db);
  configureSyncUser(TEST_USER);
  await db.open();
  await db.activityPersonalBudgets.clear();
  await db.outboxMutations.clear();
});

describe("DexieActivityPersonalBudgetRepository", () => {
  it("upserts one private budget per activity and user", async () => {
    const created = await activityPersonalBudgetRepository.upsert({ id: "budget-1", activityId: "activity-1", tripId: "trip-1", userId: TEST_USER, amountMinor: 12500n, currency: "USD" });
    const updated = await activityPersonalBudgetRepository.upsert({ id: "ignored", activityId: "activity-1", tripId: "trip-1", userId: TEST_USER, amountMinor: 20000n, currency: "USD" });

    expect(created.version).toBe(1);
    expect(updated.id).toBe("budget-1");
    expect(updated.version).toBe(2);
    expect((await activityPersonalBudgetRepository.getByActivityAndUser("activity-1", TEST_USER))?.amountMinor).toBe(20000n);
    expect(await db.activityPersonalBudgets.count()).toBe(1);
    expect(await db.outboxMutations.where("entityType").equals("activityPersonalBudget").count()).toBe(1);
  });
});
