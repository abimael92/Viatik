import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  deleteDatabase,
  getDatabase,
  setCurrentDatabase,
  type ViatikDatabase,
} from "@/lib/db/dexie";
import { configureSyncUser } from "@/lib/sync/sync-context";
import {
  tripIdeaRepository,
  tripSavingsPlanRepository,
} from "@/features/trip-planner/data/dexie-trip-planner-repository";

const USER_ID = "00000000-0000-4000-8000-000000000001";
let db: ViatikDatabase;

beforeEach(async () => {
  await deleteDatabase(USER_ID);
  db = getDatabase(USER_ID);
  setCurrentDatabase(db);
  configureSyncUser(USER_ID);
  await db.open();
});

afterEach(async () => {
  vi.restoreAllMocks();
  setCurrentDatabase(null);
  configureSyncUser(null);
  db.close();
  await deleteDatabase(USER_ID);
});

function newIdea(id = "idea-1") {
  return {
    id,
    name: "Kyoto spring",
    origin: "Montréal, QC",
    destination: "Kyoto, Japan",
    startDate: "2027-06-10",
    durationDays: 5,
    adultCount: 2,
    currency: "CAD",
    targetTripCostMinor: 100_000n,
    categoryEstimates: [
      { category: "transport" as const, amountMinor: 30_000n },
      { category: "stay" as const, amountMinor: 40_000n },
      { category: "food" as const, amountMinor: 20_000n },
    ],
  };
}

describe("DexieTripPlannerRepository", () => {
  it("upgrades a version 46 database and preserves existing trip and budget rows", async () => {
    const userId = "planner-schema-upgrade-user";
    const legacy = new Dexie(`viatik_${userId}`);
    legacy.version(46).stores({
      trips: "id, ownerId, updatedAt, deletedAt",
      tripBudgets: "id, tripId, updatedAt, deletedAt",
    });
    await legacy.open();
    await legacy.table("trips").put({ id: "legacy-trip", name: "Old trip" });
    await legacy
      .table("tripBudgets")
      .put({ id: "legacy-budget", tripId: "legacy-trip", totalBudgetMinor: 2500n });
    legacy.close();

    const upgraded = getDatabase(userId);
    await upgraded.open();
    setCurrentDatabase(upgraded);

    expect(upgraded.verno).toBe(47);
    expect((await upgraded.trips.get("legacy-trip"))?.name).toBe("Old trip");
    expect((await upgraded.tripBudgets.get("legacy-budget"))?.totalBudgetMinor).toBe(2500n);
    expect(await upgraded.tripIdeas.count()).toBe(0);
    expect(await upgraded.tripSavingsPlans.count()).toBe(0);

    setCurrentDatabase(db);
    await deleteDatabase(userId);
  });

  it("stores ideas and savings locally without outbox mutations", async () => {
    const idea = await tripIdeaRepository.create(newIdea());
    const plan = await tripSavingsPlanRepository.getByIdea(idea.id);

    expect(idea.currency).toBe("CAD");
    expect(idea.targetTripCostMinor).toBe(100_000n);
    expect(idea.version).toBe(1);
    expect(plan).toMatchObject({ tripIdeaId: idea.id, currentSavingsMinor: 0n, version: 1 });
    expect(await db.outboxMutations.count()).toBe(0);
  });

  it("updates local revisions and cascades idea deletion to its savings plan", async () => {
    await tripIdeaRepository.create(newIdea());
    const plan = await tripSavingsPlanRepository.getByIdea("idea-1");
    const saved = await tripSavingsPlanRepository.updatePlan(plan!.id, {
      currentSavingsMinor: 12_345n,
    });
    const edited = await tripIdeaRepository.updateIdea("idea-1", { notes: "Save for the gardens" });

    expect(saved.version).toBe(2);
    expect(edited.version).toBe(2);
    expect((await tripSavingsPlanRepository.getByIdea("idea-1"))?.currentSavingsMinor).toBe(
      12_345n
    );
    await tripIdeaRepository.remove("idea-1");
    expect(await db.tripIdeas.get("idea-1")).toBeUndefined();
    expect(await tripSavingsPlanRepository.getByIdea("idea-1")).toBeUndefined();
    expect(await db.outboxMutations.count()).toBe(0);
  });

  it("records manual prices in minor units with source and date", async () => {
    await tripIdeaRepository.create(newIdea());
    const updated = await tripIdeaRepository.addPriceCheck("idea-1", {
      category: "transport",
      amountMinor: 25_599n,
      source: "Google Flights",
      checkedAt: "2026-10-09",
    });

    expect(updated.priceChecks).toHaveLength(1);
    expect(updated.priceChecks[0]).toMatchObject({
      amountMinor: 25_599n,
      source: "Google Flights",
    });
    expect(await db.outboxMutations.count()).toBe(0);
  });

  it("atomically creates a trip, owner membership, private budget, and only their outbox inserts", async () => {
    await tripIdeaRepository.create(newIdea());

    const trip = await tripIdeaRepository.convertToTrip("idea-1");
    const idea = await tripIdeaRepository.getById("idea-1");
    const members = await db.tripMembers.where("tripId").equals(trip.id).toArray();
    const budget = await db.tripBudgets.where("tripId").equals(trip.id).first();
    const mutations = await db.outboxMutations.toArray();

    expect(trip.destination).toBe("Kyoto, Japan");
    expect(trip.endDate).toBe("2027-06-14");
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ userId: USER_ID, role: "owner" });
    expect(budget).toMatchObject({ totalBudgetMinor: 100_000n, createdBy: USER_ID });
    expect(budget?.categoryAllocations.map(({ category }) => category)).toEqual([
      "transport",
      "stay",
      "food",
    ]);
    expect(idea?.convertedToTripId).toBe(trip.id);
    expect(mutations.map(({ entityType, operation }) => [entityType, operation]).sort()).toEqual([
      ["trip", "insert"],
      ["tripMember", "insert"],
    ]);
  });

  it("routes retries to the already-created trip without duplicating records", async () => {
    await tripIdeaRepository.create(newIdea());
    const trip = await tripIdeaRepository.convertToTrip("idea-1");
    const repeated = await tripIdeaRepository.convertToTrip("idea-1");

    expect(repeated.id).toBe(trip.id);
    expect(await db.trips.count()).toBe(1);
    expect(await db.tripMembers.count()).toBe(1);
    expect(await db.tripBudgets.count()).toBe(1);
    expect(await db.outboxMutations.count()).toBe(2);
  });

  it("rejects invalid trip dates without creating partial trip records", async () => {
    await tripIdeaRepository.create(newIdea());
    await db.tripIdeas.update("idea-1", { startDate: "2027-06-20", endDate: "2027-06-10" });

    await expect(tripIdeaRepository.convertToTrip("idea-1")).rejects.toThrow(
      "End date must be on or after the start date."
    );
    expect(await db.trips.count()).toBe(0);
    expect(await db.tripMembers.count()).toBe(0);
    expect(await db.tripBudgets.count()).toBe(0);
    expect(await db.outboxMutations.count()).toBe(0);
    expect((await tripIdeaRepository.getById("idea-1"))?.convertedToTripId).toBeNull();
  });

  it("rolls back trip, membership, and outbox writes when the local budget insert fails", async () => {
    await tripIdeaRepository.create(newIdea());
    await db.tripBudgets.add({
      id: "budget-id-duplicate",
      tripId: "another-trip",
      totalBudgetMinor: 1n,
      dailyTargetMinor: null,
      categoryAllocations: [],
      createdBy: USER_ID,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      deletedAt: null,
    });
    const ids = [
      "00000000-0000-4000-8000-000000000010",
      "00000000-0000-4000-8000-000000000011",
      "00000000-0000-4000-8000-000000000012",
      "00000000-0000-4000-8000-000000000013",
      "budget-id-duplicate",
    ];
    vi.spyOn(crypto, "randomUUID").mockImplementation(() => ids.shift()!);

    await expect(tripIdeaRepository.convertToTrip("idea-1")).rejects.toThrow();

    expect(await db.trips.count()).toBe(0);
    expect(await db.tripMembers.count()).toBe(0);
    expect(await db.tripBudgets.where("tripId").equals("another-trip").count()).toBe(1);
    expect(await db.outboxMutations.count()).toBe(0);
    expect((await tripIdeaRepository.getById("idea-1"))?.convertedToTripId).toBeNull();
  });
});
