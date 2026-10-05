import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/00000000000072_refresh_connection_avatar_snapshots.sql"),
  "utf8",
).toLowerCase();

const fn = migration.slice(
  migration.indexOf("create or replace function public.refresh_connection_avatar_snapshots"),
  migration.indexOf("revoke all on function public.refresh_connection_avatar_snapshots"),
);

describe("connection avatar snapshot refresh migration", () => {
  it("runs only after an avatar change on profiles", () => {
    expect(migration).toContain("after update of avatar_url, avatar_seed on public.profiles");
    expect(fn).toContain("new.avatar_url is not distinct from old.avatar_url");
    expect(fn).toContain("new.avatar_seed is not distinct from old.avatar_seed");
  });

  it("refreshes both sides of the user's connection snapshots", () => {
    expect(fn).toMatch(/set requester_snapshot = requester_snapshot \|\| [\s\S]*where requester_id = new\.id/);
    expect(fn).toMatch(/set recipient_snapshot = recipient_snapshot \|\| [\s\S]*where recipient_id = new\.id/);
  });

  it("writes only public avatar keys into snapshots", () => {
    const keys = [...fn.matchAll(/'([a-z_]+)',\s*new\./g)].map((match) => match[1]);
    expect(new Set(keys)).toEqual(new Set(["avatar_url", "avatar_seed"]));
    expect(fn).not.toMatch(/email|phone|passport|address|birth_date|emergency/);
  });

  it("pins the search path and is not callable directly", () => {
    expect(fn).toContain("security definer");
    expect(fn).toContain("set search_path = public");
    expect(migration).toContain("revoke all on function public.refresh_connection_avatar_snapshots() from public");
  });
});
