import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/00000000000020_trip_vault.sql"), "utf8").toLowerCase();

describe("trip vault migration", () => {
  it("creates owner-isolated vault tables", () => {
    expect(migration).toContain("create table public.vault_keysets");
    expect(migration).toContain("create table public.vault_entries");
    expect(migration).toContain("unique (owner_id)");
    expect(migration).toContain("owner_id uuid not null");
  });

  it("enables row level security with owner-only and active-trip membership policies", () => {
    expect(migration).toContain("alter table public.vault_keysets enable row level security");
    expect(migration).toContain("alter table public.vault_entries enable row level security");
    expect(migration).toContain('"vault_keysets_select_owner"');
    expect(migration).toContain('"vault_entries_select_owner"');
    expect(migration).toContain("owner_id = auth.uid()");
    expect(migration).toContain("public.is_active_trip_member(trip_id, auth.uid())");
  });

  it("uses dedicated security-invoker CAS functions", () => {
    expect(migration).toContain("create or replace function public.sync_vault_keyset_cas_upsert");
    expect(migration).toContain("create or replace function public.sync_vault_entry_cas_upsert");
    expect(migration).toContain("security invoker");
    expect(migration).toContain("v_owner_id <> auth.uid()");
    expect(migration).toContain("vault entry trip_id and owner_id are immutable");
  });

  it("grants execute only to authenticated and revokes public access", () => {
    expect(migration).toContain("revoke all on function public.sync_vault_keyset_cas_upsert");
    expect(migration).toContain("grant execute on function public.sync_vault_keyset_cas_upsert");
    expect(migration).toContain("to authenticated");
  });

  it("publishes vault tables to realtime", () => {
    expect(migration).toContain("alter publication supabase_realtime add table public.vault_keysets, public.vault_entries");
  });
});
