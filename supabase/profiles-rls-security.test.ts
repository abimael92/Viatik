import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/00000000000035_fix_profiles_rls.sql"),
  "utf8",
).toLowerCase();

const rpcBody = migration.slice(
  migration.indexOf("create or replace function public.get_profile_public_data"),
  migration.indexOf("revoke all on function public.get_profile_public_data"),
);
const viewBody = migration.slice(
  migration.indexOf("create or replace view public.profile_public_data"),
  migration.indexOf("revoke all on public.profile_public_data from public"),
);

describe("profiles RLS fix migration", () => {
  it("drops the over-broad shared-trip read policy on profiles", () => {
    expect(migration).toContain('drop policy if exists "profiles_select_self_or_shared_trip" on public.profiles');
    expect(migration).toContain('drop policy if exists "profiles_select_authenticated" on public.profiles');
  });

  it("adds a strict self-only select policy on profiles", () => {
    expect(migration).toContain('create policy "profiles_select_self"');
    expect(migration).toContain("using (auth.uid() = id)");
    expect(migration).not.toContain("using (true)");
  });

  it("exposes a self-scoped public-data view with only safe columns", () => {
    expect(migration).toContain("create or replace view public.profile_public_data");
    expect(migration).toContain("with (security_barrier = true)");
    expect(migration).toContain("from public.profiles");
    expect(migration).toContain("grant select on public.profile_public_data to authenticated");
    expect(migration).toContain("revoke all on public.profile_public_data from public");
    // The view must not project any private column.
    for (const safe of ["full_name", "avatar_url", "avatar_seed", "public_handle", "preferred_currency", "preferred_language"]) {
      expect(viewBody).toContain(safe);
    }
    for (const leak of ["phone", "email", "birth_date", "passport", "allergies", "dietary_restrictions", "emergency_contact"]) {
      expect(viewBody).not.toContain(leak);
    }
  });

  it("creates a security-definer RPC gated to caller + shared-trip members", () => {
    expect(rpcBody).toContain("security definer");
    expect(rpcBody).toContain("v_uid uuid := auth.uid()");
    expect(rpcBody).toContain("if v_uid is null");
    expect(rpcBody).toContain("raise exception 'authentication required'");
    // Trip-gated exactly like the old authorization, so it cannot enumerate arbitrary users.
    expect(rpcBody).toContain("profile_membership.trip_id = viewer_membership.trip_id");
    expect(rpcBody).toContain("shared_trip.deleted_at is null");
    expect(rpcBody).toContain("pd.profile_id = any(p_ids)");
    expect(rpcBody).toContain("pd.profile_id = v_uid");
  });

  it("reads from the sanitized directory, never the raw profiles table", () => {
    expect(rpcBody).toContain("from public.profile_directory pd");
    expect(rpcBody).not.toMatch(/from public\.profiles\b/);
  });

  it("returns only allow-listed public columns and rejects oversized batches", () => {
    expect(rpcBody).toContain("returns table (");
    for (const safe of ["full_name", "avatar_url", "avatar_seed", "public_handle", "preferred_currency", "preferred_language"]) {
      expect(rpcBody).toContain(safe);
    }
    for (const leak of ["phone", "email", "birth_date", "passport", "allergies", "dietary_restrictions", "emergency_contact"]) {
      expect(rpcBody).not.toContain(leak);
    }
    expect(rpcBody).toContain("cardinality(p_ids) > 200");
  });

  it("grants execute only to authenticated and revokes public access", () => {
    expect(migration).toContain("revoke all on function public.get_profile_public_data(uuid[]) from public");
    expect(migration).toContain("grant execute on function public.get_profile_public_data(uuid[]) to authenticated");
  });
});
