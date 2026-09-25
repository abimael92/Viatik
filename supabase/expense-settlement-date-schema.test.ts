import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/00000000000062_expense_settlement_date.sql"),
  "utf8",
);

describe("expense settlement date migration", () => {
  it("adds a calendar date column without creating a second settlement table", () => {
    expect(migration).toContain("add column if not exists date date not null");
    expect(migration).toContain("expense_settlements");
    expect(migration).not.toContain("create table");
  });
});
