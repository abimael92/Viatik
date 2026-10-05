// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/00000000000074_voice_note_media.sql"),
  "utf8",
).toLowerCase();

describe("voice note media migration", () => {
  it("adds kind and duration to trip media without breaking older photo clients", () => {
    expect(migration).toMatch(/add column if not exists kind text not null default 'photo'/);
    expect(migration).toMatch(/add column if not exists duration_ms integer/);
    expect(migration).toContain("check (kind in ('photo', 'audio'))");
    expect(migration).toMatch(/new\.kind := coalesce\(new\.kind, 'photo'\)/);
    expect(migration).toContain("voice clip kind cannot change");
  });

  it("keeps audio rows in the trip audio folder and out of activities", () => {
    expect(migration).toContain("content_type like 'audio/%'");
    expect(migration).toContain("activity_id is null");
    expect(migration).toContain("storage_path like trip_id::text || '/audio/%'");
  });

  it("lets any trip member add and manage only their own voice clips", () => {
    expect(migration).toContain('create policy "trip_media_insert_member_audio"');
    expect(migration).toContain('create policy "trip_media_update_own_audio"');
    const insertPolicy = migration.slice(migration.indexOf('create policy "trip_media_insert_member_audio"'));
    expect(insertPolicy.slice(0, insertPolicy.indexOf(";"))).toMatch(/kind = 'audio'[\s\S]*is_trip_member\(trip_id\)[\s\S]*created_by = auth\.uid\(\)/);
  });

  it("links notes to same-trip audio and relaxes the empty-content rule only for voice notes", () => {
    expect(migration).toMatch(/add column if not exists audio_media_id uuid references public\.trip_media \(id\)/);
    expect(migration).toContain("drop constraint if exists trip_notes_content_check");
    expect(migration).toMatch(/char_length\(trim\(content\)\) between 1 and 280\s+or audio_media_id is not null/);
    expect(migration).toContain("m.trip_id = new.trip_id");
    expect(migration).toContain("m.kind = 'audio'");
    expect(migration).toContain("voice note audio cannot be changed");
  });

  it("opens the bucket to the recorded audio formats and member uploads in the audio folder", () => {
    for (const type of ["audio/webm", "audio/mp4", "audio/ogg", "audio/mpeg"]) expect(migration).toContain(`'${type}'`);
    expect(migration).toContain("where id = 'trip-media' and allowed_mime_types is not null");
    expect(migration).toContain('create policy "trip_media_objects_insert_member_audio"');
    expect(migration).toContain('create policy "trip_media_objects_update_own_audio"');
    expect(migration).toContain('create policy "trip_media_objects_delete_own_audio"');
    expect(migration).toContain("(storage.foldername(name))[2] = 'audio'");
    expect(migration).toContain("owner_id = auth.uid()::text");
  });

  it("does not replace the shared CAS function", () => {
    expect(migration).not.toContain("function public.sync_cas_upsert");
  });
});
