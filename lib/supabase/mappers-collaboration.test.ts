import { describe, expect, it } from "vitest";

import { invitationToRow, rowToInvitation, rowToMedia, rowToTrip, rowToTripMember, tripMemberToRow, tripToRow } from "@/lib/supabase/mappers";

const timestamp = "2026-01-01T00:00:00.000Z";

describe("collaboration mappers", () => {
  it("round-trips memberships", () => {
    const member = { id: "member-1", tripId: "trip-1", userId: "user-1", viatikId: null, role: "editor" as const, invitedBy: "owner-1", joinedAt: timestamp, roleChangedAt: null, roleChangedBy: null, removedAt: null, removedBy: null, version: 1, createdAt: timestamp, updatedAt: timestamp };
    expect(rowToTripMember(tripMemberToRow(member))).toEqual(member);
  });

  it("round-trips invitations", () => {
    const invitation = { id: "invite-1", tripId: "trip-1", email: "friend@example.com", role: "viewer" as const, status: "pending" as const, invitedBy: "owner-1", invitedUserId: null, expiresAt: timestamp, statusChangedAt: timestamp, statusChangedBy: "owner-1", acceptedAt: null, acceptedBy: null, rejectedAt: null, rejectedBy: null, revokedAt: null, revokedBy: null, version: 1, createdAt: timestamp, updatedAt: timestamp };
    expect(rowToInvitation(invitationToRow(invitation))).toEqual(invitation);
  });

  it("round-trips trip lifecycle status fields through the mapper", () => {
    const trip = {
      id: "trip-1",
      ownerId: "owner-1",
      name: "Kyoto",
      description: null,
      destination: "Kyoto, Japan",
      latitude: 35,
      longitude: 135.7,
      placeId: "p",
      timeZone: "Asia/Tokyo",
      startDate: "2026-09-01",
      endDate: "2026-09-05",
      status: "active" as const,
      startedAt: timestamp,
      completedAt: null,
      coverImageUrl: null,
      adultCount: 2,
      childCount: 0,
      baseCurrency: "JPY",
      createdBy: "owner-1",
      updatedBy: "owner-1",
      deletedBy: null,
      restoredAt: null,
      restoredBy: null,
      cancelledAt: null,
      statusChangedAt: timestamp,
      statusChangedBy: "owner-1",
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    };

    const roundTripped = rowToTrip(tripToRow(trip));

    expect(roundTripped).toMatchObject({
      id: "trip-1",
      status: "active",
      startedAt: timestamp,
      completedAt: null,
      startDate: "2026-09-01",
      endDate: "2026-09-05",
    });
  });

  it("hydrates remote media without inventing a local blob", () => {
    const media = rowToMedia({ id: "media-1", trip_id: "trip-1", activity_id: null, caption: "View", storage_path: "trip-1/media-1.jpg", content_type: "image/jpeg", byte_size: 100, created_by: "user-1", created_at: timestamp, updated_at: timestamp, deleted_at: null });
    expect(media).toMatchObject({ blob: null, uploadStatus: "uploaded", uploadProgress: 100, storagePath: "trip-1/media-1.jpg" });
  });
});
