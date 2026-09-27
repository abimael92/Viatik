import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { noteToRow, rowToNote } from "@/lib/supabase/mappers";
import type { TripNote } from "@/features/trips/domain/trip-note";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/00000000000068_trip_notes.sql"),
  "utf8",
);

const note: TripNote = {
  id: "note-1",
  tripId: "trip-1",
  userId: "user-1",
  content: "Buffet closes at 12 PM",
  createdBy: "user-1",
  updatedBy: "user-1",
  deletedBy: null,
  version: 1,
  createdAt: "2026-09-27T12:00:00.000Z",
  updatedAt: "2026-09-27T12:00:00.000Z",
  deletedAt: null,
};

describe("trip notes", () => {
  it("round-trips a note through the sync mapper", () => {
    expect(rowToNote(noteToRow(note))).toEqual(note);
  });

  it("lets trip members read and write without replacing the shared sync function", () => {
    expect(migration).toContain("create table public.trip_notes");
    expect(migration).toContain("public.is_trip_member(trip_id)");
    expect(migration).toContain("sync_trip_note_cas_upsert");
    expect(migration).not.toContain("sync_cas_upsert");
  });
});
