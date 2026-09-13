import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Connection } from "@/features/domain/entities";
import { connectionToRow, rowToConnection, rowToConnectionContact } from "@/lib/supabase/mappers";
import { configureSyncUser } from "@/lib/sync/sync-context";

const requesterSnapshot = { profileId: "user-alice", displayName: "Alice", viatikId: "VTK-AAAA", avatarUrl: null, avatarSeed: "adventurer|alice", publicHandle: "alice" };
const recipientSnapshot = { profileId: "user-bob", displayName: "Bob", viatikId: "VTK-BBBB", avatarUrl: null, avatarSeed: "adventurer|bob", publicHandle: "bob" };

const connection: Connection = {
  id: "conn-1",
  requesterId: "user-alice",
  recipientId: "user-bob",
  status: "pending",
  requesterSnapshot,
  recipientSnapshot,
  statusChangedAt: null,
  statusChangedBy: null,
  acceptedAt: null,
  acceptedBy: null,
  blockedAt: null,
  blockedBy: null,
  version: 1,
  source: "legacy",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-02T00:00:00Z",
};

const row = {
  id: "conn-1",
  requester_id: "user-alice",
  recipient_id: "user-bob",
  status: "pending",
  requester_snapshot: { profile_id: "user-alice", display_name: "Alice", viatik_id: "VTK-AAAA", avatar_url: null, avatar_seed: "adventurer|alice", public_handle: "alice" },
  recipient_snapshot: { profile_id: "user-bob", display_name: "Bob", viatik_id: "VTK-BBBB", avatar_url: null, avatar_seed: "adventurer|bob", public_handle: "bob" },
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z",
  status_changed_at: "2026-01-02T00:00:00Z",
  status_changed_by: "user-bob",
  accepted_at: "2026-01-02T00:00:00Z",
  accepted_by: "user-bob",
  blocked_at: null,
  blocked_by: null,
  version: 2,
  source: "viatik_id_request",
};

describe("connection mappers", () => {
  beforeEach(() => configureSyncUser("user-bob"));
  afterEach(() => configureSyncUser(null));

  it("round-trips a connection through the CAS row shape", () => {
    expect(rowToConnection(connectionToRow(connection))).toEqual(connection);
  });

  it("maps connection lifecycle metadata in both directions", () => {
    const mapped = rowToConnection(row);
    expect(mapped).toMatchObject({
      statusChangedAt: "2026-01-02T00:00:00Z",
      statusChangedBy: "user-bob",
      acceptedAt: "2026-01-02T00:00:00Z",
      acceptedBy: "user-bob",
      blockedAt: null,
      blockedBy: null,
      version: 2,
      source: "viatik_id_request",
    });
    expect(connectionToRow(mapped)).toMatchObject({
      status_changed_at: "2026-01-02T00:00:00Z",
      status_changed_by: "user-bob",
      accepted_at: "2026-01-02T00:00:00Z",
      accepted_by: "user-bob",
      blocked_at: null,
      blocked_by: null,
      version: 2,
      source: "viatik_id_request",
    });
  });

  it("materializes an inbound pending contact from the counterpart snapshot", () => {
    const contact = rowToConnectionContact(row);
    expect(contact.ownerId).toBe("user-bob");
    expect(contact.linkedProfileId).toBe("user-alice");
    expect(contact.connectionId).toBe("conn-1");
    expect(contact.connectionStatus).toBe("pending");
    expect(contact.connectionDirection).toBe("inbound");
    expect(contact.fullName).toBe("Alice");
    expect(contact.avatarSeed).toBe("adventurer|alice");
    expect(contact.linkedHandle).toBe("alice");
  });

  it("materializes an outbound pending contact when the viewer is the requester", () => {
    configureSyncUser("user-alice");
    const contact = rowToConnectionContact(row);
    expect(contact.connectionDirection).toBe("outbound");
    expect(contact.fullName).toBe("Bob");
    expect(contact.linkedProfileId).toBe("user-bob");
  });

  it("marks accepted edges with no direction", () => {
    configureSyncUser("user-bob");
    const contact = rowToConnectionContact({ ...row, status: "accepted" });
    expect(contact.connectionStatus).toBe("accepted");
    expect(contact.connectionDirection).toBeNull();
    expect(contact.deletedAt).toBeNull();
  });

  it("soft-deletes blocked/declined edges so they drop out of the list", () => {
    const contact = rowToConnectionContact({ ...row, status: "blocked" });
    expect(contact.deletedAt).not.toBeNull();
  });
});
