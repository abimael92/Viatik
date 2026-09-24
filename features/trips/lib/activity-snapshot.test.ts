import { describe, expect, it } from "vitest";

import type { Activity } from "@/features/domain/entities";
import { replaceActivitySnapshot } from "@/features/trips/lib/activity-snapshot";

const baseActivity: Activity = {
  id: "activity-1",
  tripId: "trip-1",
  dayDate: "2026-09-23",
  title: "Museum",
  description: null,
  category: "sightseeing",
  startTime: null,
  endTime: null,
  checklist: [],
  position: 1,
  estimatedCostMinor: null,
  createdBy: "user-1",
  createdAt: "2026-09-23T12:00:00.000Z",
  updatedAt: "2026-09-23T12:00:00.000Z",
  deletedAt: null,
};

describe("replaceActivitySnapshot", () => {
  it("replaces a stale activity with the repository result containing saved Must-dos", () => {
    const saved = {
      ...baseActivity,
      checklist: [
        { id: "task-1", title: "prueba 1", completed: false, archived: false },
        { id: "task-2", title: "prueba 2", completed: false, archived: false },
      ],
      updatedAt: "2026-09-23T12:01:00.000Z",
    };

    expect(replaceActivitySnapshot([baseActivity], saved)[0]).toBe(saved);
    expect(replaceActivitySnapshot([baseActivity], saved)[0]?.checklist).toHaveLength(2);
  });
});
