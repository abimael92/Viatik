import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/00000000000019_account_linking_and_contact_logistics.sql"),
  "utf8",
).toLowerCase();

const lookupBody = migration.slice(
  migration.indexOf("create function public.lookup_profile_for_linking"),
  migration.indexOf("revoke all on function public.lookup_profile_for_linking"),
);
const contactCasBody = migration.slice(
  migration.indexOf("create function public.sync_contact_cas_upsert"),
  migration.indexOf("revoke all on function public.sync_contact_cas_upsert"),
);

describe("account linking and contact logistics migration", () => {
  it("replaces broad profile reads with self or shared-trip access", () => {
    expect(migration).toContain('drop policy "profiles_select_authenticated"');
    expect(migration).toContain('create policy "profiles_select_self_or_shared_trip"');
    expect(migration).toContain("id = auth.uid()");
    expect(migration).toContain("profile_membership.trip_id = viewer_membership.trip_id");
    expect(migration).not.toContain("using (true)");
  });

  it("exposes only allow-listed profile linking fields to authenticated callers", () => {
    expect(lookupBody).toContain("security definer");
    expect(lookupBody).toContain("if auth.uid() is null");
    expect(lookupBody).toContain("returns table (");
    expect(lookupBody).toContain("profile_id uuid");
    expect(lookupBody).toContain("p.viatik_id");
    expect(lookupBody).toContain("p.public_handle");
    expect(lookupBody).not.toMatch(/p\.(phone|email)\b/);
    expect(migration).toContain("revoke all on function public.lookup_profile_for_linking(text) from public");
    expect(migration).toContain("grant execute on function public.lookup_profile_for_linking(text) to authenticated");
  });

  it("uses constrained opaque identifiers and contains no raw passport-number field", () => {
    expect(migration).toContain("profiles_viatik_id_key unique (viatik_id)");
    expect(migration).toContain("profiles_viatik_id_format_chk");
    expect(migration).toContain("substr(md5(id::text), 1, 16)");
    expect(migration).not.toMatch(/passport_(number|no)\b/);
  });

  it("provides an RLS-respecting, serialized contact-only CAS", () => {
    expect(contactCasBody).toContain("security invoker");
    expect(contactCasBody).not.toContain("security definer");
    expect(contactCasBody).toContain("pg_advisory_xact_lock");
    expect(contactCasBody).toContain("for update");
    expect(contactCasBody).toContain("'status', 'not_found'");
    expect(contactCasBody).toContain("'status', 'conflict'");
    expect(contactCasBody).toContain("'status', 'applied'");
    expect(migration).toContain("revoke all on function public.sync_contact_cas_upsert(jsonb, timestamptz) from public");
    expect(migration).toContain("grant execute on function public.sync_contact_cas_upsert(jsonb, timestamptz) to authenticated");
  });

  it("updates every existing and added contact field explicitly", () => {
    const fields = [
      "owner_id",
      "full_name",
      "email",
      "phone",
      "linked_profile_id",
      "relationship",
      "traveler_type",
      "birth_date",
      "notes",
      "linked_avatar_url",
      "linked_handle",
      "emergency_contact_name",
      "emergency_contact_relationship",
      "emergency_contact_phone",
      "dietary_restrictions",
      "allergies",
      "passport_issuing_country",
      "passport_expires_on",
      "preferred_currency",
      "preferred_language",
      "deleted_at",
    ];

    for (const field of fields) {
      expect(contactCasBody).toContain(`${field} = (payload.row).${field}`);
    }
    expect(migration).toContain("alter type public.contact_relationship add value 'roommate'");
  });
});
