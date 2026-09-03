import type { ProfileSummary, TripInvitation, TripMember, TripMemberRole } from "@/features/domain/entities";

export interface CollaborationRepository {
  listMembers(tripId: string): Promise<TripMember[]>;
  watchMembers(tripId: string, onChange: (members: TripMember[]) => void): () => void;
  listProfiles(userIds: string[]): Promise<ProfileSummary[]>;
  listInvitations(tripId?: string): Promise<TripInvitation[]>;
  watchInvitations(tripId: string | undefined, onChange: (invitations: TripInvitation[]) => void): () => void;
  invite(input: { id: string; tripId: string; email: string; role: Exclude<TripMemberRole, "owner">; invitedBy: string }): Promise<TripInvitation>;
  updateMemberRole(memberId: string, role: Exclude<TripMemberRole, "owner">): Promise<void>;
  removeMember(memberId: string): Promise<void>;
  acceptInvitation(invitationId: string): Promise<void>;
  rejectInvitation(invitationId: string): Promise<void>;
  revokeInvitation(invitationId: string): Promise<void>;
}
