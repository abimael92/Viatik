import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";

import { tripTaskRepository } from "@/features/trips/data/dexie-trip-task-repository";
import { deleteDatabase, getDatabase, setCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";

const TEST_USER = "trip-tasks-user";
let db: ViatikDatabase;

beforeEach(async () => {
  await deleteDatabase(TEST_USER);
  db = getDatabase(TEST_USER);
  setCurrentDatabase(db);
  await db.open();
});

describe("trip task repository", () => {
  it("stores an open task locally and queues an insert", async () => {
    const task = await tripTaskRepository.create({
      id: "11111111-1111-4111-8111-111111111111",
      tripId: "22222222-2222-4222-8222-222222222222",
      creatorId: "33333333-3333-4333-8333-333333333333",
      title: "  Find the airport bus  ",
      description: "Check the night route",
    });

    expect(task.status).toBe("open");
    expect(task.title).toBe("Find the airport bus");
    expect(await db.tripTasks.get(task.id)).toMatchObject({ status: "open" });
    const queued = await db.outboxMutations.toArray();
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      entityType: "tripTask",
      operation: "insert",
      entityId: task.id,
      baseUpdatedAt: null,
    });
  });

  it("resolves a task with a note and queues an update against the previous timestamp", async () => {
    const task = await tripTaskRepository.create({
      id: "11111111-1111-4111-8111-111111111111",
      tripId: "22222222-2222-4222-8222-222222222222",
      creatorId: "33333333-3333-4333-8333-333333333333",
      title: "Book a Zoox",
    });

    await db.outboxMutations.clear();
    const resolved = await tripTaskRepository.resolve(
      task.id,
      "33333333-3333-4333-8333-333333333333",
      "Pickup is at 6 PM",
      ["22222222-2222-4222-8222-222222222222/photo.jpg"],
    );

    expect(resolved.status).toBe("resolved");
    expect(resolved.resolutionText).toBe("Pickup is at 6 PM");
    expect(resolved.attachments).toEqual(["22222222-2222-4222-8222-222222222222/photo.jpg"]);
    const queued = await db.outboxMutations.toArray();
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      entityType: "tripTask",
      operation: "update",
      baseUpdatedAt: task.updatedAt,
    });
  });
});
