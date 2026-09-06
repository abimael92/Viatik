import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deleteDatabase, getDatabase, setCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { transitRepository } from "@/features/transit/data/dexie-transit-repository";

const TEST_USER = "test-transit-user";

let db: ViatikDatabase;

beforeEach(async () => {
  await deleteDatabase(TEST_USER);
  db = getDatabase(TEST_USER);
  setCurrentDatabase(db);
  await db.open();
  await db.transitSegments.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DexieTransitRepository", () => {
  it("creates a scheduled segment with defaults", async () => {
    const created = await transitRepository.create({
      tripId: "trip-1",
      mode: "flight",
      dayDate: "2026-06-02",
      carrier: "Delta",
      carrierCode: "DL",
      number: "1284",
      scheduledDeparture: "2026-06-02T10:00:00Z",
      createdBy: TEST_USER,
    });

    expect(created.status).toBe("scheduled");
    expect(created.delayMinutes).toBeNull();
    expect(created.gate).toBeNull();

    const stored = await db.transitSegments.get(created.id);
    expect(stored).toEqual(created);
  });

  it("lists segments by trip and by day, sorted by departure", async () => {
    await transitRepository.create({ tripId: "trip-1", mode: "flight", dayDate: "2026-06-02", carrier: "A", number: "1", scheduledDeparture: "2026-06-02T12:00:00Z", createdBy: TEST_USER });
    await transitRepository.create({ tripId: "trip-1", mode: "train", dayDate: "2026-06-02", carrier: "B", number: "2", scheduledDeparture: "2026-06-02T09:00:00Z", createdBy: TEST_USER });
    await transitRepository.create({ tripId: "trip-1", mode: "flight", dayDate: "2026-06-05", carrier: "C", number: "3", scheduledDeparture: "2026-06-05T08:00:00Z", createdBy: TEST_USER });

    const byDay = await transitRepository.listByDay("trip-1", "2026-06-02");
    expect(byDay.map((s) => s.number)).toEqual(["2", "1"]);

    const byTrip = await transitRepository.listByTrip("trip-1");
    expect(byTrip).toHaveLength(3);
  });

  it("applies a status update and soft-deletes", async () => {
    const created = await transitRepository.create({
      tripId: "trip-1",
      mode: "train",
      dayDate: "2026-06-02",
      carrier: "Amtrak",
      number: "448",
      scheduledDeparture: "2026-06-02T08:00:00Z",
      createdBy: TEST_USER,
    });

    const updated = await transitRepository.update(created.id, {
      status: "delayed",
      delayMinutes: 30,
      gate: "Track 9",
    });
    expect(updated.status).toBe("delayed");
    expect(updated.gate).toBe("Track 9");

    await transitRepository.remove(created.id);
    expect(await transitRepository.listByTrip("trip-1")).toHaveLength(0);
  });
});
