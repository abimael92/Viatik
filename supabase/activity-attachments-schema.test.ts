import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/00000000000061_activity_attachments.sql"),
  "utf8",
);

describe("activity attachments migration", () => {
  it("adds a bounded JSONB attachments column and validation trigger", () => {
    expect(migration).toContain("add column if not exists attachments jsonb not null default '[]'::jsonb");
    expect(migration).toContain("activities_attachments_array_chk");
    expect(migration).toContain("jsonb_array_length(new.attachments) > 8");
    expect(migration).toContain("kind = 'image'");
    expect(migration).toContain("kind = 'link'");
    expect(migration).toContain("kind = 'location'");
  });

  it("keeps attachment structure editor-only and includes attachments in Activity CAS", () => {
    expect(migration).toContain("new.attachments is distinct from old.attachments");
    expect(migration).toContain("attachments=(payload.row).attachments");
  });
});
