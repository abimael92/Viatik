import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/00000000000066_birth_date_before_today.sql"),
  "utf8",
).toLowerCase();

describe("birth date constraint", () => {
  it("rejects today for profiles and contacts", () => {
    expect(migration).toContain("birth_date < current_date");
    expect(migration).toContain("profiles_birth_date_chk");
    expect(migration).toContain("contacts_birth_date_chk");
    expect(migration).not.toContain("birth_date <= current_date");
  });
});
