import { liveQuery } from "dexie";

import { getCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { TransactionContext } from "@/lib/db/transaction-context";
import type { ProfileSummary, Trip, TripInvitation, TripMember, TripMemberRole } from "@/features/domain/entities";
import type { Notification } from "@/features/notifications/domain/notification-types";
import type { CollaborationRepository } from "@/features/domain/repositories/collaboration-repository";
import { append } from "@/lib/sync/outbox-transactional";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { pullRemoteChanges } from "@/lib/sync/cloud-sync";

function getDb(): ViatikDatabase {
  const db = getCurrentDatabase();
  if (!db) throw new Error("No database is open. Wrap calls in DatabaseProvider.");
  return db;
}

export class DexieCollaborationRepository implements CollaborationRepository {
  listMembers(tripId: string): Promise<TripMember[]> {
    const db = getDb();
    return db.tripMembers.where("tripId").equals(tripId).toArray();
  }

  watchMembers(tripId: string, onChange: (members: TripMember[]) => void): () => void {
    const subscription = liveQuery(() => this.listMembers(tripId)).subscribe({ next: onChange });
    return () => subscription.unsubscribe();
  }

  async listProfiles(userIds: string[]): Promise<ProfileSummary[]> {
    if (!userIds.length || typeof navigator === "undefined" || !navigator.onLine) return [];
    // Read collaborator identity through the safe `get_profile_public_data` RPC
    // (migration 37) which returns only public columns for the caller + shared-trip
    // members. Reading `profiles` directly is now self-only for RLS.
    const { data, error } = await getSupabaseBrowserClient().rpc("get_profile_public_data", { p_ids: userIds });
    if (error) throw new Error(error.message);
    return (data ?? []).map((profile: { id: string; full_name: string | null; avatar_url: string | null; avatar_seed?: string | null }) => ({ id: String(profile.id), fullName: profile.full_name == null ? null : String(profile.full_name), avatarUrl: profile.avatar_url == null ? null : String(profile.avatar_url), avatarSeed: profile.avatar_seed == null ? null : String(profile.avatar_seed), email: null }));
  }

  listInvitations(tripId?: string): Promise<TripInvitation[]> {
    const db = getDb();
    return tripId ? db.tripInvitations.where("tripId").equals(tripId).toArray() : db.tripInvitations.toArray();
  }

  watchInvitations(tripId: string | undefined, onChange: (invitations: TripInvitation[]) => void): () => void {
    const subscription = liveQuery(() => this.listInvitations(tripId)).subscribe({ next: onChange });
    return () => subscription.unsubscribe();
  }

  async invite(input: { id: string; tripId: string; email: string; role: Exclude<TripMemberRole, "owner">; invitedBy: string }): Promise<TripInvitation> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.tripInvitations], async (ctx) => {
      const now = new Date().toISOString();
      const email = input.email.trim().toLowerCase();
      const existing = await ctx.table<TripInvitation>("tripInvitations").where("tripId").equals(input.tripId).and((invitation) => invitation.email === email).first();
      const invitation: TripInvitation = {
        ...input,
        id: existing?.id ?? input.id,
        email,
        status: "pending",
        invitedUserId: null,
        expiresAt: new Date(Date.now() + 14 * 86400000).toISOString(),
        statusChangedAt: existing?.statusChangedAt ?? now,
        statusChangedBy: existing?.statusChangedBy ?? input.invitedBy,
        acceptedAt: existing?.acceptedAt ?? null,
        acceptedBy: existing?.acceptedBy ?? null,
        rejectedAt: existing?.rejectedAt ?? null,
        rejectedBy: existing?.rejectedBy ?? null,
        revokedAt: existing?.revokedAt ?? null,
        revokedBy: existing?.revokedBy ?? null,
        version: existing?.version ?? 1,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      await ctx.table<TripInvitation>("tripInvitations").put(invitation);
      await append("invitation", existing ? "update" : "insert", invitation, { tx: ctx, baseUpdatedAt: existing?.updatedAt ?? null });
      return invitation;
    });
  }

  async updateMemberRole(memberId: string, role: Exclude<TripMemberRole, "owner">): Promise<void> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.tripMembers], async (ctx) => {
      const member = await ctx.table<TripMember>("tripMembers").get(memberId);
      if (!member) throw new Error("Member not found");
      const updatedAt = new Date().toISOString();
      const updated = { ...member, role, updatedAt };
      await ctx.table<TripMember>("tripMembers").put(updated);
      await append("tripMember", "update", updated, { tx: ctx, baseUpdatedAt: member.updatedAt });
    });
  }

  async setMemberRoleByUser(tripId: string, userId: string, role: Exclude<TripMemberRole, "owner">, byUserId: string): Promise<void> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.tripMembers, db.notifications, db.trips], async (ctx) => {
      const now = new Date().toISOString();
      const existing = await ctx.table<TripMember>("tripMembers")
        .where("[tripId+userId]").equals([tripId, userId])
        .first();
      if (existing) {
        if (existing.role === role) return;
        const updated = { ...existing, role, updatedAt: now };
        await ctx.table<TripMember>("tripMembers").put(updated);
        await append("tripMember", "update", updated, { tx: ctx, baseUpdatedAt: existing.updatedAt });
        return;
      }
      const member: TripMember = {
        id: crypto.randomUUID(),
        tripId,
        userId,
        role,
        invitedBy: byUserId,
        joinedAt: now,
        roleChangedAt: null,
        roleChangedBy: null,
        removedAt: null,
        removedBy: null,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      await ctx.table<TripMember>("tripMembers").add(member);
      await append("tripMember", "insert", member, { tx: ctx, baseUpdatedAt: null });
      const trip = await ctx.table<Trip>("trips").get(tripId);
      const notification: Notification = {
        id: crypto.randomUUID(),
        userId,
        type: "trip_added",
        referenceId: tripId,
        isRead: false,
        pushSentAt: null,
        message: trip?.name?.trim() || "__trip__",
        createdAt: now,
        updatedAt: now,
        version: 1,
      };
      await ctx.table<Notification>("notifications").put(notification);
      await append("notification", "insert", notification, { tx: ctx, baseUpdatedAt: null });
    });
  }

  async removeMember(memberId: string): Promise<void> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.tripMembers], async (ctx) => {
      const member = await ctx.table<TripMember>("tripMembers").get(memberId);
      if (!member) return;
      await ctx.table<TripMember>("tripMembers").delete(memberId);
      await append("tripMember", "delete", { ...member, mutatedAt: new Date().toISOString() }, { tx: ctx, baseUpdatedAt: member.updatedAt });
    });
  }

  async acceptInvitation(invitationId: string): Promise<void> {
    const { error } = await getSupabaseBrowserClient().rpc("accept_trip_invitation", { p_invitation_id: invitationId });
    if (error) throw new Error(error.message);
    const db = getDb();
    await TransactionContext.runInTransaction([db.tripInvitations], async (ctx) => {
      const invitation = await ctx.table<TripInvitation>("tripInvitations").get(invitationId);
      if (!invitation) return;
      const updated = { ...invitation, status: "accepted" as const, updatedAt: new Date().toISOString() };
      await ctx.table<TripInvitation>("tripInvitations").put(updated);
    });
    await pullRemoteChanges(true);
  }

  async rejectInvitation(invitationId: string): Promise<void> {
    const { error } = await getSupabaseBrowserClient().rpc("reject_trip_invitation", { p_invitation_id: invitationId });
    if (error) throw new Error(error.message);
    const db = getDb();
    await TransactionContext.runInTransaction([db.tripInvitations], async (ctx) => {
      const invitation = await ctx.table<TripInvitation>("tripInvitations").get(invitationId);
      if (!invitation) return;
      const updated = { ...invitation, status: "rejected" as const, updatedAt: new Date().toISOString() };
      await ctx.table<TripInvitation>("tripInvitations").put(updated);
    });
  }

  async revokeInvitation(invitationId: string): Promise<void> {
    await this.setInvitationStatus(invitationId, "revoked");
  }

  private async setInvitationStatus(invitationId: string, status: "rejected" | "revoked"): Promise<void> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.tripInvitations], async (ctx) => {
      const invitation = await ctx.table<TripInvitation>("tripInvitations").get(invitationId);
      if (!invitation) throw new Error("Invitation not found");
      const updatedAt = new Date().toISOString();
      const updated = { ...invitation, status, updatedAt };
      await ctx.table<TripInvitation>("tripInvitations").put(updated);
      await append("invitation", "update", updated, { tx: ctx, baseUpdatedAt: invitation.updatedAt });
    });
  }
}

export const collaborationRepository = new DexieCollaborationRepository();
