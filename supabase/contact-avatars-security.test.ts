import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/00000000000024_contact_avatars.sql"),
  "utf8",
).toLowerCase();

const casBody = migration.slice(
  migration.indexOf("create or replace function public.sync_contact_cas_upsert"),
  migration.indexOf("revoke all on function public.sync_contact_cas_upsert"),
);

describe("contact avatars migration", () => {
  it("adds an optional avatar_url column to contacts", () => {
    expect(migration).toContain("add column avatar_url text");
    expect(migration).toContain("contacts_avatar_url_length_chk");
    expect(migration).toContain("char_length(avatar_url) <= 2048");
  });

  it("persists avatar_url through the contact CAS update path", () => {
    expect(casBody).toContain("avatar_url = (payload.row).avatar_url");
    expect(casBody).toContain("security invoker");
    expect(casBody).not.toContain("security definer");
  });

  it("still grants execute only to authenticated", () => {
    expect(migration).toContain("revoke all on function public.sync_contact_cas_upsert(jsonb, timestamptz) from public");
    expect(migration).toContain("grant execute on function public.sync_contact_cas_upsert(jsonb, timestamptz) to authenticated");
  });
});
