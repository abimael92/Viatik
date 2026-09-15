import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/00000000000045_activity_voting.sql"),
  "utf8"
);

describe("activity voting migration", () => {
  it("adds proposal metadata without dropping schema", () => {
    expect(migration).toContain("add column if not exists poll_status");
    expect(migration).toContain("add column if not exists voting_ends_at");
    expect(migration).toContain("add column if not exists poll_options jsonb");
    expect(migration).toContain("add column if not exists poll_votes jsonb");
    expect(migration.toLowerCase()).not.toContain("drop column");
  });

  it("includes voting fields in the versioned activity CAS update", () => {
    expect(migration).toContain("poll_status=(payload.row).poll_status");
    expect(migration).toContain("poll_options=(payload.row).poll_options");
    expect(migration).toContain("poll_votes=(payload.row).poll_votes");
  });

  it("allows members to update only voting metadata", () => {
    expect(migration).toContain('create policy "activities_vote_members"');
    expect(migration).toContain("Trip members may only update activity voting fields");
  });
});
