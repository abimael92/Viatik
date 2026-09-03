import { liveQuery } from "dexie";

import { getCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { TransactionContext } from "@/lib/db/transaction-context";
import type { ProfileSummary, TripInvitation, TripMember, TripMemberRole } from "@/features/domain/entities";
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
    const { data, error } = await getSupabaseBrowserClient().from("profiles").select("id, full_name, avatar_url").in("id", userIds);
    if (error) throw new Error(error.message);
    return (data ?? []).map((profile) => ({ id: String(profile.id), fullName: profile.full_name == null ? null : String(profile.full_name), avatarUrl: profile.avatar_url == null ? null : String(profile.avatar_url), email: null }));
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
