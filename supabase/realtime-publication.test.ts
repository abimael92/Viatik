import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/00000000000063_realtime_collaborator_tables.sql"),
  "utf8",
);

describe("collaborator realtime publication", () => {
  it("publishes every table the client already subscribes to", () => {
    for (const table of ["activity_personal_budgets", "connections", "user_wallets", "notifications"]) {
      expect(migration).toContain(`'${table}'`);
    }
    expect(migration).toContain("alter publication supabase_realtime add table");
  });
});

const decisionSync = readFileSync(
  join(process.cwd(), "supabase/migrations/00000000000064_decision_sync.sql"),
  "utf8",
);

describe("crew poll realtime publication", () => {
  it("publishes decisions, options, and votes", () => {
    for (const table of ["decisions", "decision_options", "decision_votes"]) {
      expect(decisionSync).toContain(`'${table}'`);
    }
    expect(decisionSync).toContain("sync_decision_cas_upsert");
  });
});