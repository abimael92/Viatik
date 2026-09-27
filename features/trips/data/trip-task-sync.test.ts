import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { rowToTask, taskToRow } from "@/lib/supabase/mappers";
import type { TripTask } from "@/features/trips/domain/trip-task";
import { frontendCopy } from "@/lib/i18n/frontend-copy";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/00000000000069_trip_tasks.sql"),
  "utf8",
);

const task: TripTask = {
  id: "task-1",
  tripId: "trip-1",
  creatorId: "user-1",
  assigneeId: "user-2",
  title: "Find the night bus",
  description: "Last bus after dinner",
  resolutionText: null,
  status: "open",
  attachments: ["trip-1/photo.jpg"],
  createdBy: "user-1",
  updatedBy: "user-1",
  deletedBy: null,
  version: 1,
  createdAt: "2026-09-27T12:00:00.000Z",
  updatedAt: "2026-09-27T12:00:00.000Z",
  deletedAt: null,
};

describe("trip tasks", () => {
  it("round-trips a task through the sync mapper", () => {
    expect(rowToTask(taskToRow(task))).toEqual(task);
  });

  it("lets trip members read and write without replacing the shared sync function", () => {
    expect(migration).toContain("create table public.trip_tasks");
    expect(migration).toContain("public.is_trip_member(trip_id)");
    expect(migration).toContain("sync_trip_task_cas_upsert");
    expect(migration).toContain("status in ('open', 'resolved')");
    expect(migration).not.toContain("sync_cas_upsert");
  });

  it("uses the crew task labels in both languages", () => {
    expect(frontendCopy.es).toMatchObject({
      research: "Investigar",
      assignedTo: "Asignado a",
      resolveTask: "Resolver",
      attach: "Adjuntar",
      openTasks: "Pendientes",
      resolvedTasks: "Resueltas",
    });
    expect(frontendCopy.en).toMatchObject({
      research: "Research",
      assignedTo: "Assigned to",
      resolveTask: "Resolve",
      attach: "Attach",
    });
  });
});
