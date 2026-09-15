import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/00000000000025_avatar_seeds.sql"),
  "utf8",
).toLowerCase();

const contactCas = migration.slice(
  migration.indexOf("create or replace function public.sync_contact_cas_upsert"),
  migration.indexOf("revoke all on function public.sync_contact_cas_upsert"),
);
const lookup = migration.slice(
  migration.indexOf("create or replace function public.lookup_profile_for_linking"),
  migration.indexOf("revoke all on function public.lookup_profile_for_linking"),
);

describe("avatar seeds migration", () => {
  it("adds an avatar_seed column to profiles and the directory", () => {
    expect(migration).toContain("alter table public.profiles\n  add column avatar_seed text");
    expect(migration).toContain("alter table public.profile_directory\n  add column avatar_seed text");
  });

  it("keeps the directory seed in sync via the trigger", () => {
    expect(migration).toContain("create or replace function public.sync_profile_directory()");
    expect(migration).toContain("avatar_seed = excluded.avatar_seed");
    expect(migration).toContain("security definer");
  });

  it("returns the seed from the lookup without private fields", () => {
    expect(lookup).toContain("avatar_seed text");
    expect(lookup).toContain("pd.avatar_seed");
    expect(lookup).not.toMatch(/pd\.(email|phone)\b/);
  });

  it("persists avatar_seed on contact updates", () => {
    expect(contactCas).toContain("avatar_seed = (payload.row).avatar_seed");
    expect(contactCas).toContain("security invoker");
  });
});
