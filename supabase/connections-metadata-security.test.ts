import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/00000000000038_connections_metadata.sql"),
  "utf8"
).toLowerCase();

describe("connections lifecycle metadata migration", () => {
  it("adds lifecycle, source, and optimistic concurrency fields", () => {
    for (const field of [
      "status_changed_at",
      "status_changed_by",
      "accepted_at",
      "accepted_by",
      "blocked_at",
      "blocked_by",
      "version bigint not null default 1",
      "source text not null default 'legacy'",
    ]) {
      expect(migration).toContain(field);
    }
  });

  it("backfills actors and timestamps from the authoritative connection parties", () => {
    expect(migration).toContain("when status = 'pending' then requester_id else recipient_id");
    expect(migration).toContain("when status = 'accepted' then updated_at else null");
    expect(migration).toContain("when status = 'blocked' then updated_at else null");
    expect(migration).toContain("0fb843db-9c96-4021-92f8-f143ddd3efe8");
  });

  it("enforces lifecycle consistency and server-controlled version increments", () => {
    expect(migration).toContain("connections_lifecycle_chk");
    expect(migration).toContain("connections_status_actor_chk");
    expect(migration).toContain("new.version := old.version + 1");
    expect(migration).toContain("new.updated_at := now()");
    expect(migration).toContain("new.accepted_by := new.recipient_id");
    expect(migration).toContain("new.blocked_by := new.recipient_id");
  });

  it("marks QR-created or upgraded connections with their source", () => {
    expect(migration).toContain("source = 'qr_scan'");
    expect(migration).toContain("v_requester, p_recipient_id, 'accepted', v_req_snap, v_recip_snap, 'qr_scan'");
  });
});
