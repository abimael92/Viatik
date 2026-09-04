import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/00000000000022_profile_directory.sql"),
  "utf8",
).toLowerCase();

const lookupBody = migration.slice(
  migration.indexOf("create or replace function public.lookup_profile_for_linking"),
  migration.indexOf("revoke all on function public.lookup_profile_for_linking"),
);

describe("profile directory migration", () => {
  it("adds an opt-in discoverable flag to the private profile", () => {
    expect(migration).toContain("add column discoverable boolean not null default false");
  });

  it("creates a public directory with no private columns", () => {
    expect(migration).toContain("create table public.profile_directory");
    for (const column of ["viatik_id", "display_name", "avatar_url", "public_handle", "preferred_currency", "preferred_language", "discoverable"]) {
      expect(migration).toContain(column);
    }
    expect(migration).not.toMatch(/profile_directory\s*\([^)]*(email|phone|passport_no|address)/i);
    expect(migration).toContain("profile_directory_viatik_id_format_chk");
    expect(migration).toContain("'^vtk-[0-9a-f]{16}$'");
  });

  it("locks down direct table access via RLS with no policies", () => {
    expect(migration).toContain("alter table public.profile_directory enable row level security");
    expect(migration).toContain("alter table public.profile_lookup_attempts enable row level security");
    expect(migration).not.toContain('policy "profile_directory_select');
    expect(migration).not.toContain('policy "profile_directory_insert');
  });

  it("keeps the directory in sync through a security-definer trigger", () => {
    expect(migration).toContain("create or replace function public.sync_profile_directory()");
    expect(migration).toContain("security definer");
    expect(migration).toContain("on conflict (profile_id) do update set");
    expect(migration).toContain("delete from public.profile_directory where profile_id = new.id");
    expect(migration).toContain("create trigger sync_profile_directory_after_write");
  });

  it("rate-limits lookups with a per-user sliding window", () => {
    expect(migration).toContain("create table public.profile_lookup_attempts");
    expect(lookupBody).toContain("for update");
    expect(lookupBody).toContain("interval '60 seconds'");
    expect(lookupBody).toContain("raise exception 'rate limit exceeded. try again later.' using errcode = '42900'");
    expect(lookupBody).toContain("v_max constant integer := 30");
  });

  it("reads only from the directory and never the private profiles table", () => {
    expect(lookupBody).toContain("security definer");
    expect(lookupBody).toContain("v_uid uuid := auth.uid()");
    expect(lookupBody).toContain("if v_uid is null");
    expect(lookupBody).toContain("from public.profile_directory pd");
    expect(lookupBody).toContain("pd.viatik_id");
    expect(lookupBody).toContain("pd.display_name");
    expect(lookupBody).toContain("pd.discoverable");
    expect(lookupBody).not.toMatch(/from public\.profiles\b/);
    expect(lookupBody).not.toMatch(/p\.(phone|email)\b/);
  });

  it("accepts only canonical Viatik IDs and returns no private fields", () => {
    expect(lookupBody).toContain("if v_id !~ '^vtk-[0-9a-f]{16}$'");
    expect(lookupBody).toContain("raise exception 'invalid viatik id' using errcode = '22023'");
    for (const column of ["display_name", "avatar_url", "public_handle", "preferred_currency", "preferred_language"]) {
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
