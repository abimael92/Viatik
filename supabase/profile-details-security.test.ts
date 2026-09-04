import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/00000000000023_profile_details.sql"),
  "utf8",
).toLowerCase();

describe("profile details migration", () => {
  it("adds optional personal detail columns to profiles", () => {
    for (const column of [
      "birth_date",
      "emergency_contact_name",
      "emergency_contact_relationship",
      "emergency_contact_phone",
      "dietary_restrictions",
      "allergies",
      "passport_issuing_country",
      "passport_expires_on",
    ]) {
      expect(migration).toContain(`add column ${column}`);
    }
    // Arrays default to empty and are NOT NULL so the row always has a clean value.
    expect(migration).toContain("dietary_restrictions text[] not null default '{}'");
    expect(migration).toContain("allergies text[] not null default '{}'");
  });

  it("constrains the personal details like contact data", () => {
    expect(migration).toContain("profiles_emergency_phone_length_chk");
    expect(migration).toContain("profiles_dietary_restrictions_chk");
    expect(migration).toContain("cardinality(dietary_restrictions) <= 50");
    expect(migration).toContain("profiles_allergies_chk");
    expect(migration).toContain("profiles_passport_country_chk");
    expect(migration).toContain("'^[a-z]{2}$'");
    expect(migration).toContain("profiles_birth_date_chk");
    expect(migration).toContain("birth_date <= current_date");
  });

  it("stores no sensitive identity document numbers", () => {
    expect(migration).not.toMatch(/passport_(number|no)\b/);
    expect(migration).not.toMatch(/add column passport_number/);
  });
});
