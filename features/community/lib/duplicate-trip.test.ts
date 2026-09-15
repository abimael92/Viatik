import { describe, expect, it } from "vitest";

import type { Activity, Expense, ExpenseShare, Trip } from "@/features/domain/entities";
import { buildTripClone, type TripCloneSource } from "@/features/community/lib/duplicate-trip";

function makeSource(overrides: Partial<Trip> = {}): TripCloneSource {
  const trip: Trip = {
    id: "trip-old",
    ownerId: "author-1",
    name: "Kyoto in Spring",
    description: "Temples, markets and cherry blossoms.",
    destination: "Kyoto, Japan",
    latitude: 35.0116,
    longitude: 135.7681,
    placeId: "kyoto",
    timeZone: "Asia/Tokyo",
    startDate: "2026-04-05",
    endDate: "2026-04-12",
    status: "planned",
    startedAt: null,
    completedAt: null,
    coverImageUrl: null,
    adultCount: 2,
    childCount: 0,
    baseCurrency: "USD",
    isPublic: true,
    shareSlug: "kyoto-spring",
    likesCount: 1234,
    forkCount: 321,
    authorName: "Mika",
    createdBy: "author-1",
    updatedBy: "author-1",
    deletedBy: null,
    restoredAt: null,
    restoredBy: null,
    cancelledAt: null,
    statusChangedAt: "2026-01-01T00:00:00.000Z",
    statusChangedBy: "author-1",
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };

  const activityA: Activity = {
    id: "act-a",
    tripId: trip.id,
    dayDate: "2026-04-05",
    title: "Fushimi Inari",
    description: null,
    location: "Kyoto",
    category: "sightseeing",
    startTime: "2026-04-05T09:00:00",
    endTime: null,
    position: 1024,
    estimatedCostMinor: 0n,
    createdBy: trip.ownerId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
  };
  const activityB: Activity = {
    id: "act-b",
    tripId: trip.id,
    dayDate: "2026-04-06",
    title: "Nishiki Market",
    description: "Food street.",
    location: "Kyoto",
    category: "food",
    startTime: null,
    endTime: null,
    position: 2048,
    estimatedCostMinor: 2500n,
    createdBy: trip.ownerId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
  };

  const expense: Expense = {
    id: "exp-1",
    tripId: trip.id,
    activityId: "act-b",
    description: "Market lunch",
    amountMinor: 4000n,
    currency: "JPY",
    exchangeRateToBase: 0.0067,
    paidBy: "member-9",
    splitType: "equal",
    category: "food",
    subcategory: "restaurants",
    date: "2026-04-06",
    createdBy: "author-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
  };

  const shareA: ExpenseShare = {
    id: "share-1",
    expenseId: expense.id,
    paidBy: expense.paidBy,
    userId: "member-9",
    shareAmountMinor: 2000n,
    sharePercentage: 50,
    splitType: "equal",
    settlementStatus: "pending",
    settledAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const shareB: ExpenseShare = {
    id: "share-2",
    expenseId: expense.id,
    paidBy: expense.paidBy,
    userId: "member-10",
    shareAmountMinor: 2000n,
    sharePercentage: 50,
    splitType: "equal",
    settlementStatus: "pending",
    settledAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  return { trip, activities: [activityA, activityB], expenses: [expense], shares: [shareA, shareB] };
}

function makeOptions(owner = "new-user-1") {
  let counter = 0;
  return {
    newOwnerId: owner,
    now: () => "2026-02-02T00:00:00.000Z",
    idFactory: () => `gen-${++counter}`,
  };
}

describe("buildTripClone", () => {
  it("does not mutate the source records", () => {
    const source = makeSource();
    const bigintSafe = (_key: string, value: unknown) =>
      typeof value === "bigint" ? value.toString() : value;
    const snapshot = JSON.stringify(source, bigintSafe);
    buildTripClone(source, makeOptions());
    expect(JSON.stringify(source, bigintSafe)).toBe(snapshot);
  });

  it("regenerates every id and maps tripId across related records", () => {
    const source = makeSource();
    const result = buildTripClone(source, makeOptions());

    expect(result.trip.id).toBe("gen-1");
    expect(result.trip.id).not.toBe(source.trip.id);

    expect(result.activities.map((a) => a.id)).toEqual(["gen-2", "gen-3"]);
    expect(result.activities.every((a) => a.tripId === result.trip.id)).toBe(true);

    expect(result.expenses[0].tripId).toBe(result.trip.id);
    expect(result.expenses[0].id).toBe("gen-4");

    expect(result.shares.map((s) => s.expenseId)).toEqual([result.expenses[0].id, result.expenses[0].id]);
  });

  it("remaps activityId on expenses to the new activity id", () => {
    const source = makeSource();
    const result = buildTripClone(source, makeOptions());

    // Source expense referenced act-b; the clone must reference the new act-b id.
    const oldActivityId = source.expenses[0].activityId as string;
    const newActivityId = result.idMap.activityIds.get(oldActivityId);
    expect(newActivityId).toBe("gen-3");
    expect(result.expenses[0].activityId).toBe(newActivityId);
    expect(result.expenses[0].activityId).not.toBe(oldActivityId);
  });

  it("remaps expenseId on shares to the new expense id", () => {
    const source = makeSource();
    const result = buildTripClone(source, makeOptions());

    const newExpenseId = result.idMap.expenseIds.get(source.expenses[0].id);
    expect(result.shares.every((share) => share.expenseId === newExpenseId)).toBe(true);
    expect(result.shares.every((share) => share.expenseId !== source.expenses[0].id)).toBe(true);
  });

  it("handles expenses with a null activityId without remapping", () => {
    const source = makeSource();
    source.expenses[0] = { ...source.expenses[0], activityId: null };
    const result = buildTripClone(source, makeOptions());
    expect(result.expenses[0].activityId).toBeNull();
  });

  it("refreshes timestamps and clears soft-delete on all records", () => {
    const source = makeSource();
    // Simulate some soft-deleted activities that should not come along.
    source.activities[1] = { ...source.activities[1], deletedAt: "2026-01-05T00:00:00.000Z" };
    const result = buildTripClone(source, makeOptions());

    const records = [result.trip, ...result.activities, ...result.expenses, ...result.shares];
    for (const record of records) {
      expect(record.createdAt).toBe("2026-02-02T00:00:00.000Z");
      expect(record.updatedAt).toBe("2026-02-02T00:00:00.000Z");
      if ("deletedAt" in record) expect(record.deletedAt).toBeNull();
    }
  });

  it("resets ownership and community fields to a private copy", () => {
    const source = makeSource();
    const result = buildTripClone(source, makeOptions("new-owner"));

    expect(result.trip.ownerId).toBe("new-owner");
    expect(result.trip.isPublic).toBe(false);
    expect(result.trip.shareSlug).toBeNull();
    expect(result.trip.likesCount).toBe(0);
    expect(result.trip.forkCount).toBe(0);
    expect(result.trip.authorName).toBeNull();
    expect(result.activities.every((a) => a.createdBy === "new-owner")).toBe(true);
    expect(result.expenses.every((e) => e.createdBy === "new-owner")).toBe(true);
  });

  it("applies a custom copy name and preserves trip content fields", () => {
    const source = makeSource();
    const result = buildTripClone(source, { ...makeOptions(), newName: "My Kyoto Plan" });

    expect(result.trip.name).toBe("My Kyoto Plan");
    expect(result.trip.destination).toBe("Kyoto, Japan");
    expect(result.trip.startDate).toBe("2026-04-05");
  });

  it("defaults the copy name to '<name> (copy)'", () => {
    const result = buildTripClone(makeSource(), makeOptions());
    expect(result.trip.name).toBe("Kyoto in Spring (copy)");
  });

  it("preserves counts and share values while regenerating ids", () => {
    const source = makeSource();
    const result = buildTripClone(source, makeOptions());

    expect(result.activities).toHaveLength(source.activities.length);
    expect(result.expenses).toHaveLength(source.expenses.length);
    expect(result.shares).toHaveLength(source.shares.length);

    expect(result.shares.map((s) => s.shareAmountMinor)).toEqual([2000n, 2000n]);
    expect(result.expenses[0].amountMinor).toBe(source.expenses[0].amountMinor);
    expect(new Set([...result.activities.map((a) => a.id), ...result.expenses.map((e) => e.id), ...result.shares.map((s) => s.id)]).size).toBe(
      result.activities.length + result.expenses.length + result.shares.length
    );
  });
});
