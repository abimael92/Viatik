import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deleteDatabase, getDatabase, setCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { TransactionContext } from "@/lib/db/transaction-context";
import type { OutboxMutation } from "@/lib/sync/types";
import { acknowledgeMutation } from "@/lib/sync/outbox";
import { configureSyncUser } from "@/lib/sync/sync-context";
import { tripRepository } from "@/features/trips/data/dexie-trip-repository";
import { expenseRepository } from "@/features/expenses/data/dexie-expense-repository";
import { activityRepository } from "@/features/activities/data/dexie-activity-repository";
import { contactRepository, tripTravelerRepository } from "@/features/contacts/data/dexie-contact-repository";
import { collaborationRepository } from "@/features/collaboration/data/dexie-collaboration-repository";
import { mediaRepository } from "@/features/media/data/dexie-media-repository";

const TEST_USER = "test-user";

const originalTable = TransactionContext.prototype.table;

function stubOutboxAdd(
  predicate: (mutation: OutboxMutation) => boolean,
  error: Error
): () => void {
  const spy = vi.spyOn(TransactionContext.prototype, "table").mockImplementation(function (this: TransactionContext, name: string) {
    const realTable = originalTable.call(this, name);
    if (name !== "outboxMutations") return realTable;

    return new Proxy(realTable, {
      get(target, prop) {
        if (prop === "put") {
          return async (mutation: OutboxMutation) => {
            if (predicate(mutation)) throw error;
            return target.put(mutation);
          };
        }
        return target[prop as keyof typeof target];
      },
    });
  });

  return () => spy.mockRestore();
}

let db: ViatikDatabase;

async function resetDatabase(): Promise<void> {
  const tables = [
    db.trips,
    db.tripMembers,
    db.activities,
    db.expenses,
    db.expenseShares,
    db.tripMedia,
    db.tripInvitations,
    db.expenseSettlements,
    db.tripTravelers,
    db.contacts,
    db.outboxMutations,
    db.syncMetadata,
    db.syncConflicts,
  ];
  for (const table of tables) {
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

describe("transactional writes", () => {
  it("creates a trip and its owner membership atomically", async () => {
    const trip = await tripRepository.create({
      id: "trip-1",
      ownerId: "user-1",
      name: "Paris",
    });

    expect(trip.id).toBe("trip-1");
    expect(await db.trips.get("trip-1")).toEqual(trip);
    const members = await db.tripMembers.where("tripId").equals("trip-1").toArray();
    expect(members).toHaveLength(1);
    expect(members[0].role).toBe("owner");

    const mutations = await db.outboxMutations.toArray();
    expect(mutations).toHaveLength(2);
    expect(mutations.some((m) => m.entityType === "trip" && m.operation === "insert")).toBe(true);
    expect(mutations.some((m) => m.entityType === "tripMember" && m.operation === "insert")).toBe(true);
  });

  it("coalesces an insert followed by updates into one insert", async () => {
    await tripRepository.create({ id: "trip-coalesced-insert", ownerId: "user-1", name: "Initial" });
    await tripRepository.update("trip-coalesced-insert", { name: "Second" });
    await tripRepository.update("trip-coalesced-insert", { name: "Final" });

    const mutations = await db.outboxMutations.where("entityType").equals("trip").toArray();
    expect(mutations).toHaveLength(1);
    expect(mutations[0]).toEqual(expect.objectContaining({ operation: "insert", baseUpdatedAt: null, payload: expect.objectContaining({ name: "Final" }) }));
  });

  it("preserves the original server version across repeated offline updates", async () => {
    const trip = await tripRepository.create({ id: "trip-coalesced-update", ownerId: "user-1", name: "Initial" });
    await db.outboxMutations.clear();
    const serverUpdatedAt = "2026-01-01T00:00:00.000Z";
    await db.trips.put({ ...trip, updatedAt: serverUpdatedAt });

    await tripRepository.update(trip.id, { name: "Second" });
    await tripRepository.update(trip.id, { name: "Final" });

    const mutations = await db.outboxMutations.toArray();
    expect(mutations).toHaveLength(1);
    expect(mutations[0]).toEqual(expect.objectContaining({ operation: "update", baseUpdatedAt: serverUpdatedAt, payload: expect.objectContaining({ name: "Final" }) }));
  });

  it("rebases a concurrently coalesced edit instead of deleting it on acknowledgement", async () => {
    const trip = await tripRepository.create({ id: "trip-concurrent-update", ownerId: "user-1", name: "Initial" });
    await db.outboxMutations.clear();
    await db.trips.put({ ...trip, updatedAt: "2026-01-01T00:00:00.000Z" });
    await tripRepository.update(trip.id, { name: "In flight" });
    const inFlight = (await db.outboxMutations.toArray())[0];

    await tripRepository.update(trip.id, { name: "Newer local edit" });
    await acknowledgeMutation(inFlight, "2026-01-03T00:00:00.000Z");

    const pending = await db.outboxMutations.get(inFlight.id);
    expect(pending).toEqual(expect.objectContaining({ operation: "update", baseUpdatedAt: "2026-01-03T00:00:00.000Z", payload: expect.objectContaining({ name: "Newer local edit" }) }));
  });

  it("rolls back trip and membership when the outbox fails", async () => {
    const restore = stubOutboxAdd(
      (m) => m.entityType === "trip",
      new Error("outbox down")
    );

    await expect(
      tripRepository.create({ id: "trip-fail", ownerId: "user-1", name: "Fail" })
    ).rejects.toThrow("outbox down");

    restore();

    expect(await db.trips.get("trip-fail")).toBeUndefined();
    expect(await db.tripMembers.where("tripId").equals("trip-fail").count()).toBe(0);
    expect(await db.outboxMutations.count()).toBe(0);
  });

  it("creates an expense and its shares atomically", async () => {
    const expense = await expenseRepository.create({
      id: "expense-1",
      tripId: "trip-1",
      description: "Dinner",
      amount: 10000,
      currency: "USD",
      paidBy: "user-1",
      splitType: "equal",
      createdBy: "user-1",
      shares: [
        { userId: "user-1", shareAmount: 5000, sharePercentage: 50 },
        { userId: "user-2", shareAmount: 5000, sharePercentage: 50 },
      ],
    });

    expect(await db.expenses.get("expense-1")).toEqual(expense);
    const shares = await db.expenseShares.where("expenseId").equals("expense-1").toArray();
    expect(shares).toHaveLength(2);

    const mutations = await db.outboxMutations.toArray();
    expect(mutations.filter((m) => m.entityType === "expense")).toHaveLength(1);
    expect(mutations.filter((m) => m.entityType === "expenseShare")).toHaveLength(2);
  });

  it("rolls back expense and all shares when share outbox fails", async () => {
    const restore = stubOutboxAdd(
      (m) => m.entityType === "expenseShare",
      new Error("share outbox failed")
    );

    await expect(
      expenseRepository.create({
        id: "expense-fail",
        tripId: "trip-1",
        description: "Lunch",
        amount: 5000,
        currency: "USD",
        paidBy: "user-1",
        splitType: "equal",
        createdBy: "user-1",
        shares: [{ userId: "user-1", shareAmount: 5000, sharePercentage: 100 }],
      })
    ).rejects.toThrow("share outbox failed");

    restore();

    expect(await db.expenses.get("expense-fail")).toBeUndefined();
    expect(await db.expenseShares.where("expenseId").equals("expense-fail").count()).toBe(0);
    expect(await db.outboxMutations.count()).toBe(0);
  });

  it("replaces expense shares atomically without orphaned rows", async () => {
    await expenseRepository.create({
      id: "expense-replace",
      tripId: "trip-1",
      description: "Taxi",
      amount: 3000,
      currency: "USD",
      paidBy: "user-1",
      splitType: "equal",
      createdBy: "user-1",
      shares: [
        { userId: "user-1", shareAmount: 1500, sharePercentage: 50 },
        { userId: "user-2", shareAmount: 1500, sharePercentage: 50 },
      ],
    });

    await db.outboxMutations.clear();

    await expenseRepository.replaceShares("expense-replace", [
      { userId: "user-1", shareAmount: 3000, sharePercentage: 100 },
    ]);

    const shares = await db.expenseShares.where("expenseId").equals("expense-replace").toArray();
    expect(shares).toHaveLength(1);
    expect(shares[0].userId).toBe("user-1");

    const mutations = await db.outboxMutations.toArray();
    expect(mutations.some((m) => m.entityType === "expenseShare" && m.operation === "delete")).toBe(true);
    expect(mutations.some((m) => m.entityType === "expenseShare" && m.operation === "update")).toBe(true);
  });

  it("updates a contact with its original base version", async () => {
    const contact = await contactRepository.create({ id: "contact-update", ownerId: TEST_USER, fullName: "Before" });
    await db.outboxMutations.clear();
    const baseUpdatedAt = "2026-01-01T00:00:00.000Z";
    await db.contacts.put({ ...contact, updatedAt: baseUpdatedAt });

    await contactRepository.update(contact.id, TEST_USER, { fullName: "After", travelerType: "child" });

    const mutation = (await db.outboxMutations.where("entityType").equals("contact").toArray())[0];
    expect(mutation).toEqual(expect.objectContaining({ operation: "update", baseUpdatedAt, payload: expect.objectContaining({ fullName: "After", travelerType: "child" }) }));
  });

  it("atomically propagates contact snapshots only to selected upcoming trips", async () => {
    const upcoming = await tripRepository.create({ id: "upcoming", ownerId: TEST_USER, name: "Upcoming", endDate: "2099-01-02" });
    const other = await tripRepository.create({ id: "other", ownerId: TEST_USER, name: "Other", endDate: "2099-02-02" });
    const past = await tripRepository.create({ id: "past", ownerId: TEST_USER, name: "Past", endDate: "2000-01-02" });
    const contact = await contactRepository.create({ id: "propagate", ownerId: TEST_USER, fullName: "Before", travelerType: "adult" });
    for (const trip of [upcoming, other, past]) await tripTravelerRepository.attach({ id: `traveler-${trip.id}`, tripId: trip.id, contact, createdBy: TEST_USER });
    await db.outboxMutations.clear();

    const trips = await contactRepository.listUpcomingTrips(contact.id, TEST_USER, "2026-01-01");
    expect(trips.map((trip) => trip.id)).toEqual(["upcoming", "other"]);
    await contactRepository.update(contact.id, TEST_USER, { fullName: "After", travelerType: "child" }, [upcoming.id, past.id]);

    expect(await db.tripTravelers.get("traveler-upcoming")).toEqual(expect.objectContaining({ displayName: "After", travelerType: "child" }));
    expect(await db.tripTravelers.get("traveler-other")).toEqual(expect.objectContaining({ displayName: "Before", travelerType: "adult" }));
    expect(await db.tripTravelers.get("traveler-past")).toEqual(expect.objectContaining({ displayName: "Before", travelerType: "adult" }));
    expect(await db.outboxMutations.where("entityType").equals("tripTraveler").count()).toBe(1);
  });

  it("rejects contact mutations by a different owner", async () => {
    const contact = await contactRepository.create({ id: "private-contact", ownerId: TEST_USER, fullName: "Private" });
    await expect(contactRepository.update(contact.id, "another-user", { fullName: "Changed" })).rejects.toThrow("Contact not found.");
    await contactRepository.remove(contact.id, "another-user");
    expect(await db.contacts.get(contact.id)).toEqual(contact);
  });

  it("creates an activity, contact, traveler, invitation and media atomically", async () => {
    const activity = await activityRepository.create({
      id: "activity-1",
      tripId: "trip-1",
      dayDate: "2026-06-01",
      title: "Museum",
      position: 1,
      createdBy: "user-1",
    });
    expect(await db.activities.get("activity-1")).toEqual(activity);

    const contact = await contactRepository.create({
      id: "contact-1",
      ownerId: "user-1",
      fullName: "Alice",
    });
    expect(await db.contacts.get("contact-1")).toEqual(contact);

    const traveler = await tripTravelerRepository.attach({
      id: "traveler-1",
      tripId: "trip-1",
      contact,
      createdBy: "user-1",
    });
    expect(await db.tripTravelers.get("traveler-1")).toEqual(traveler);

    const invitation = await collaborationRepository.invite({
      id: "invite-1",
      tripId: "trip-1",
      email: "bob@example.com",
      role: "viewer",
      invitedBy: "user-1",
    });
    expect(await db.tripInvitations.get(invitation.id)).toEqual(invitation);

    const blob = new Blob(["photo"], { type: "image/jpeg" });
    const media = await mediaRepository.create({
      id: "media-1",
      tripId: "trip-1",
      blob,
      createdBy: "user-1",
    });
    const storedMedia = await db.tripMedia.get("media-1");
    expect(storedMedia).toEqual(expect.objectContaining({ id: media.id, tripId: "trip-1" }));

    const mutations = await db.outboxMutations.toArray();
    expect(mutations.some((m) => m.entityType === "activity")).toBe(true);
    expect(mutations.some((m) => m.entityType === "contact")).toBe(true);
    expect(mutations.some((m) => m.entityType === "tripTraveler")).toBe(true);
    expect(mutations.some((m) => m.entityType === "invitation")).toBe(true);
  });
});
