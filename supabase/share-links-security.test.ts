import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/00000000000034_trip_share_links.sql"),
  "utf8",
);

describe("trip share links migration security", () => {
  it("creates the table with a unique slug and enables RLS", () => {
    expect(migration).toContain("create table public.trip_share_links");
    expect(migration).toContain("constraint trip_share_links_slug_key unique (slug)");
    expect(migration).toContain("alter table public.trip_share_links enable row level security;");
  });

  it("restricts management to the trip owner", () => {
    expect(migration).toMatch(/trip_share_links_select_owner[\s\S]*using \(public\.is_trip_owner\(trip_id\)\)/);
    expect(migration).toMatch(/trip_share_links_insert_owner[\s\S]*with check \(public\.is_trip_owner\(trip_id\)\)/);
    expect(migration).toMatch(/trip_share_links_update_owner[\s\S]*with check \(public\.is_trip_owner\(trip_id\)\)/);
    expect(migration).toMatch(/trip_share_links_delete_owner[\s\S]*using \(public\.is_trip_owner\(trip_id\)\)/);
  });

  it("grants no direct anon access to the table", () => {
    // The public route uses the server-side service client, so there must be no
    // anon-granted policy or function on the table itself.
    expect(migration).not.toMatch(/to anon/);
    expect(migration).not.toMatch(/create policy[^;]*for select[^;]*to anon/);
  });

  it("defines owner-checked CAS upsert and delete functions", () => {
    expect(migration).toContain("function public.sync_trip_share_link_cas_upsert");
    expect(migration).toContain("function public.sync_trip_share_link_cas_delete");
    expect(migration).toMatch(/if not public\.is_trip_owner\(v_trip_id\) then/);
  });

  it("grants CAS functions only to authenticated and revokes from public", () => {
    expect(migration).toContain("revoke all on function public.sync_trip_share_link_cas_upsert");
    expect(migration).toContain("revoke all on function public.sync_trip_share_link_cas_delete");
    expect(migration).toContain("grant execute on function public.sync_trip_share_link_cas_upsert(jsonb, timestamptz) to authenticated;");
    expect(migration).toContain("grant execute on function public.sync_trip_share_link_cas_delete(uuid, timestamptz) to authenticated;");
  });

  it("publishes share links to realtime", () => {
    expect(migration).toContain("alter publication supabase_realtime add table public.trip_share_links;");
  });
});
