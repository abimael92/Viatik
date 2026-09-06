import { collaborationRepository } from "@/features/collaboration/data/dexie-collaboration-repository";
import type { Contact } from "@/features/domain/entities";

/**
 * When a traveler whose contact is a Viatik account is added to a trip, grant
 * them trip access as a collaborator with the default admin (editor) role.
 * Non-Viatik (offline/manual) contacts have no linked profile and get no member.
 */
export async function ensureMemberForLinkedContact(tripId: string, contact: Contact, byUserId: string): Promise<void> {
  if (!contact.linkedProfileId) return;
  await collaborationRepository.setMemberRoleByUser(tripId, contact.linkedProfileId, "editor", byUserId);
}
