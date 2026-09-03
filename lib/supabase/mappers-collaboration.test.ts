import { describe, expect, it } from "vitest";

import { invitationToRow, rowToInvitation, rowToMedia, rowToTripMember, tripMemberToRow } from "@/lib/supabase/mappers";

const timestamp = "2026-01-01T00:00:00.000Z";

describe("collaboration mappers", () => {
  it("round-trips memberships", () => {
    const member = { id: "member-1", tripId: "trip-1", userId: "user-1", role: "editor" as const, invitedBy: "owner-1", joinedAt: timestamp, createdAt: timestamp, updatedAt: timestamp };
    expect(rowToTripMember(tripMemberToRow(member))).toEqual(member);
  });

  it("round-trips invitations", () => {
    const invitation = { id: "invite-1", tripId: "trip-1", email: "friend@example.com", role: "viewer" as const, status: "pending" as const, invitedBy: "owner-1", invitedUserId: null, expiresAt: timestamp, createdAt: timestamp, updatedAt: timestamp };
    expect(rowToInvitation(invitationToRow(invitation))).toEqual(invitation);
  });

  it("hydrates remote media without inventing a local blob", () => {
    const media = rowToMedia({ id: "media-1", trip_id: "trip-1", activity_id: null, caption: "View", storage_path: "trip-1/media-1.jpg", content_type: "image/jpeg", byte_size: 100, created_by: "user-1", created_at: timestamp, updated_at: timestamp, deleted_at: null });
    expect(media).toMatchObject({ blob: null, uploadStatus: "uploaded", uploadProgress: 100, storagePath: "trip-1/media-1.jpg" });
  });
});
