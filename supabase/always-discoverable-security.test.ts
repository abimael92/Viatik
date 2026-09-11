import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/00000000000027_always_discoverable.sql"),
  "utf8",
).toLowerCase();

const lookupBody = migration.slice(
  migration.indexOf("create or replace function public.lookup_profile_for_linking"),
  migration.indexOf("revoke all on function public.lookup_profile_for_linking"),
);

describe("always discoverable migration", () => {
  it("removes the discoverability columns and index", () => {
    expect(migration).toContain("alter table public.profiles drop column if exists discoverable");
    expect(migration).toContain("alter table public.profile_directory drop column if exists discoverable");
    expect(migration).toContain("drop index if exists public.profile_directory_discoverable_idx");
  });

  it("recreates the directory sync trigger to always upsert every profile", () => {
    expect(migration).toContain("create or replace function public.sync_profile_directory()");
    expect(migration).toContain("security definer");
    expect(migration).toContain("on conflict (profile_id) do update set");
    expect(migration).not.toContain("if new.discoverable");
    expect(migration).not.toContain("delete from public.profile_directory where profile_id = new.id");
  });

  it("keeps the lookup authenticated, rate-limited, and accepts Viatik IDs or UUIDs", () => {
    expect(lookupBody).toContain("security definer");
    expect(lookupBody).toContain("v_uid uuid := auth.uid()");
    expect(lookupBody).toContain("if v_uid is null");
    expect(lookupBody).toContain("for update");
    expect(lookupBody).toContain("interval '60 seconds'");
    expect(lookupBody).toContain("raise exception 'rate limit exceeded. try again later.' using errcode = '42900'");
    expect(lookupBody).toContain("v_max constant integer := 30");
    expect(lookupBody).toContain("if v_id !~ '^vtk-[0-9a-f]{16}$'");
    expect(lookupBody).toContain("and v_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'");
  });

  it("looks up any profile by Viatik ID or UUID without a discoverability filter", () => {
    expect(lookupBody).toContain("from public.profile_directory pd");
    expect(lookupBody).toContain("pd.viatik_id = upper(v_id)");
    expect(lookupBody).toContain("pd.profile_id::text = lower(v_id)");
    expect(lookupBody).not.toContain("pd.discoverable");
    expect(lookupBody).not.toMatch(/from public\.profiles\b/);
  });

  it("returns only public fields and never private ones", () => {
    for (const column of ["display_name", "avatar_url", "avatar_seed", "public_handle", "preferred_currency", "preferred_language"]) {
      expect(lookupBody).toContain(`pd.${column}`);
    }
    expect(lookupBody).not.toContain("pd.email");
    expect(lookupBody).not.toContain("pd.phone");
  });

  it("grants execute only to authenticated and revokes public access", () => {
    expect(migration).toContain("revoke all on function public.lookup_profile_for_linking(text) from public");
    expect(migration).toContain("grant execute on function public.lookup_profile_for_linking(text) to authenticated");
  });
});
