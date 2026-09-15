import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/00000000000028_connections.sql"),
  "utf8",
).toLowerCase();

const casBody = migration.slice(
  migration.indexOf("create function public.sync_connection_cas_upsert"),
  migration.indexOf("revoke all on function public.sync_connection_cas_upsert"),
);
const qrAcceptBody = migration.slice(
  migration.indexOf("create function public.accept_connection_from_qr"),
  migration.indexOf("revoke all on function public.accept_connection_from_qr"),
);

describe("connections migration", () => {
  it("creates a connections table with a strict status enum and no self-edges", () => {
    expect(migration).toContain("create table public.connections");
    expect(migration).toContain("create type public.connection_status as enum ('pending', 'accepted', 'blocked')");
    expect(migration).toContain("constraint connections_no_self check (requester_id <> recipient_id)");
    expect(migration).toContain("constraint connections_requester_recipient_key unique (requester_id, recipient_id)");
    expect(migration).toContain("requester_id uuid not null");
    expect(migration).toContain("recipient_id uuid not null");
  });

  it("never persists private fields, even in the denormalized snapshots", () => {
    expect(migration).toContain("connection_snapshot_contains_private");
    expect(migration).toContain("connections_requester_snapshot_public_chk");
    expect(migration).toContain("connections_recipient_snapshot_public_chk");
    expect(migration).toMatch(/email\|phone\|address\|passport/);
  });

  it("enables RLS with no blanket read", () => {
    expect(migration).toContain("enable row level security");
    expect(migration).not.toContain("using (true)");
  });

  it("restricts reads to parties involved in the edge", () => {
    expect(migration).toContain("connections_select_involved");
    expect(migration).toContain("using (requester_id = auth.uid() or recipient_id = auth.uid())");
  });

  it("only lets a user insert their own pending requests", () => {
    expect(migration).toContain("connections_insert_own_request");
    expect(migration).toContain("with check (requester_id = auth.uid() and status = 'pending')");
  });

  it("only lets the recipient accept or block", () => {
    expect(migration).toContain("connections_update_recipient");
    expect(migration).toContain("using (recipient_id = auth.uid())");
    expect(migration).toContain("with check (recipient_id = auth.uid() and status in ('accepted', 'blocked'))");
  });

  it("provides an RLS-respecting, serialized CAS upsert", () => {
    expect(casBody).toContain("security invoker");
    expect(casBody).not.toContain("security definer");
    expect(casBody).toContain("pg_advisory_xact_lock");
    expect(casBody).toContain("for update");
    expect(casBody).toContain("'status', 'not_found'");
    expect(casBody).toContain("'status', 'conflict'");
    expect(casBody).toContain("'status', 'applied'");
    expect(migration).toContain("revoke all on function public.sync_connection_cas_upsert(jsonb, timestamptz) from public");
    expect(migration).toContain("grant execute on function public.sync_connection_cas_upsert(jsonb, timestamptz) to authenticated");
  });

  it("provides a security-definer QR accept that enforces the caller is requester", () => {
    expect(qrAcceptBody).toContain("security definer");
    expect(qrAcceptBody).toContain("v_requester uuid := auth.uid()");
    expect(qrAcceptBody).toContain("if v_requester is null");
    expect(qrAcceptBody).toContain("from public.profile_directory pd");
    expect(qrAcceptBody).not.toContain("(payload.row).email");
    expect(migration).toContain("revoke all on function public.accept_connection_from_qr(uuid) from public");
    expect(migration).toContain("grant execute on function public.accept_connection_from_qr(uuid) to authenticated");
  });
});
