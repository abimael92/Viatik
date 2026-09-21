"use client";

import { Link as LinkIcon, MailPlus, Pencil, Trash2, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserAvatar } from "@/components/ui/user-avatar";
import { collaborationRepository } from "@/features/collaboration/data/dexie-collaboration-repository";
import { ensureMemberForLinkedContact } from "@/features/collaboration/lib/ensure-member";
import { ContactEditorDialog } from "@/features/contacts/components/contact-editor-dialog";
import {
  contactRepository,
  tripTravelerRepository,
} from "@/features/contacts/data/dexie-contact-repository";
import type { Contact, ProfileSummary, TripInvitation, TripMember, TripTraveler } from "@/features/domain/entities";
import { cn } from "@/lib/utils";

/**
 * Merged "Travelers" panel: named travelers plus collaborators (who have a
 * Viatik account and trip access) in one place. A traveler linked to a Viatik
 * account gets an "Admin" switch (editor = admin, viewer = member), defaulting
 * to admin when the traveler is first added.
 */
export function PeoplePanel({ tripId, userId, canEdit }: { tripId: string; userId: string; canEdit: boolean }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [travelers, setTravelers] = useState<TripTraveler[]>([]);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [invitations, setInvitations] = useState<TripInvitation[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);

  useEffect(() => contactRepository.watch(userId, setContacts), [userId]);
  useEffect(() => tripTravelerRepository.watch(tripId, setTravelers), [tripId]);
  useEffect(() => collaborationRepository.watchMembers(tripId, setMembers), [tripId]);
  useEffect(() => collaborationRepository.watchInvitations(tripId, setInvitations), [tripId]);
  useEffect(() => {
    const memberIds = [...new Set(members.map((member) => member.userId))];
    if (!memberIds.length) return;
    let cancelled = false;
    void collaborationRepository.listProfiles(memberIds).then((next) => {
      if (!cancelled) setProfiles(next);
    }).catch(() => {
      if (!cancelled) setProfiles([]);
    });
    return () => {
      cancelled = true;
    };
  }, [members]);

  const available = useMemo(
    () => contacts.filter((contact) => !travelers.some((traveler) => traveler.contactId === contact.id)),
    [contacts, travelers]
  );
  const contactById = useMemo(() => new Map(contacts.map((contact) => [contact.id, contact])), [contacts]);
  const profileById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const linkedMemberIds = useMemo(
    () => new Set(travelers.map((traveler) => contactById.get(traveler.contactId)?.linkedProfileId).filter((id): id is string => Boolean(id))),
    [contactById, travelers]
  );
  const unrepresentedMembers = members.filter((member) => !linkedMemberIds.has(member.userId));

  async function attachTraveler(contact: Contact) {
    await tripTravelerRepository.attach({
      id: crypto.randomUUID(),
      tripId,
      contact,
      createdBy: userId,
    });
    // Viatik-account travelers become collaborators, admin by default.
    await ensureMemberForLinkedContact(tripId, contact, userId);
  }

  async function handleAttach(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const contact = contacts.find((item) => item.id === new FormData(form).get("contactId"));
    if (!contact) return;
    try {
      await attachTraveler(contact);
      form.reset();
      setMessage(null);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to add traveler.");
    }
  }

  async function toggleAdmin(traveler: TripTraveler, linkedProfileId: string, admin: boolean) {
    setMessage(null);
    try {
      await collaborationRepository.setMemberRoleByUser(tripId, linkedProfileId, admin ? "editor" : "viewer", userId);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to update access.");
    }
  }

  async function invite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await collaborationRepository.invite({ id: crypto.randomUUID(), tripId, email: String(data.get("email")), role: "editor", invitedBy: userId });
      event.currentTarget.reset();
      setMessage("Invitation queued and will sync automatically.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to invite collaborator.");
    }
  }

  const pendingInvitations = invitations.filter((invitation) => invitation.status === "pending");

  return (
    <section className="space-y-5">
      <div>
        <Heading level={2} className="text-2xl font-bold">Travelers</Heading>
        <p className="text-muted-foreground">
          Everyone on this trip. Names are shared; email, phone, and private details stay with you.
        </p>
      </div>

      <div className="rounded-xl border bg-muted/40 p-4 text-sm">
        <strong>Travelers</strong> are going on the trip. A traveler with a{" "}
        <strong>Viatik account</strong> can join as a collaborator — toggle <strong>Admin</strong> to
        grant them edit access (default on).
      </div>

      {message && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{message}</p>}

      <div className="divide-y rounded-2xl border bg-card">
        {travelers.map((traveler) => {
          const contact = contactById.get(traveler.contactId);
          const linkedProfileId = contact?.linkedProfileId ?? null;
          const member = linkedProfileId ? members.find((m) => m.userId === linkedProfileId) : undefined;
          const isViatik = Boolean(linkedProfileId);
          const ownerMember = member?.role === "owner";
          const adminOn = member ? member.role === "editor" : true;
          const showToggle = isViatik && canEdit && !ownerMember;
          return (
            <div key={traveler.id} className="flex flex-wrap items-center gap-3 p-4">
              <UserAvatar seed={contact?.avatarSeed} src={contact?.avatarUrl} name={traveler.displayName} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{traveler.displayName}</p>
                <p className="truncate text-xs capitalize text-muted-foreground">
                  {traveler.travelerType}
                  {isViatik && <span className="not-italic"> · Viatik account</span>}
                </p>
              </div>
              {isViatik && ownerMember && (
                <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold capitalize">Owner</span>
              )}
              {showToggle && linkedProfileId && (
                <AdminToggle checked={adminOn} onChange={(admin) => void toggleAdmin(traveler, linkedProfileId, admin)} />
              )}
              {canEdit && contact && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`${isViatik ? "Edit relationship" : "Edit traveler"} for ${traveler.displayName}`}
                  onClick={() => setEditing(contact)}
                >
                  <Pencil className="size-5" />
                </Button>
              )}
              {canEdit && (
                <Button variant="ghost" size="icon" aria-label={`Remove ${traveler.displayName}`} onClick={() => void tripTravelerRepository.remove(traveler.id)}>
                  <Trash2 className="size-5 text-destructive" />
                </Button>
              )}
            </div>
          );
        })}
        {unrepresentedMembers.map((member) => {
          const profile = profileById.get(member.userId);
          const name = profile?.fullName?.trim() || (member.userId === userId ? "You" : "Viatik traveler");
          return (
            <div key={`member-${member.id}`} className="flex flex-wrap items-center gap-3 p-4">
              <UserAvatar seed={profile?.avatarSeed} src={profile?.avatarUrl} name={name} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{name}</p>
                <p className="truncate text-xs text-muted-foreground">Viatik account</p>
              </div>
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold capitalize">{member.role}</span>
            </div>
          );
        })}
        {!travelers.length && !unrepresentedMembers.length && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <Users className="mx-auto mb-2 size-7" />
            No named travelers added.
          </div>
        )}
      </div>

      {canEdit && (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border bg-card p-5">
            <div className="flex items-center gap-2">
              <UserPlus className="size-5 text-primary" />
              <Heading level={3} className="text-base font-semibold">Add someone new</Heading>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Their contact is saved privately for future trips.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => setCreating(true)}>Add new contact</Button>
            </div>
          </div>
          <form onSubmit={handleAttach} className="rounded-2xl border bg-card p-5">
            <Heading level={3} className="text-base font-semibold">Add an existing contact</Heading>
            <p className="mt-1 text-sm text-muted-foreground">Reuse someone already in your private contacts.</p>
            <div className="mt-4 space-y-3">
              <select aria-label="Existing contact" name="contactId" required defaultValue="" className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                <option value="" disabled>Select a contact</option>
                {available.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.fullName}{contact.linkedProfileId ? " (Viatik)" : ""}
                  </option>
                ))}
              </select>
              <Button type="submit" variant="primary" disabled={!available.length}>Add traveler</Button>
            </div>
            <Button asChild variant="link" className="mt-3 px-0">
              <Link href="/contacts">Open contacts list</Link>
            </Button>
          </form>
        </div>
      )}

      {canEdit && (
        <form onSubmit={invite} className="rounded-2xl border bg-card p-5">
          <div className="flex items-center gap-2">
            <MailPlus className="size-5 text-primary" />
            <Heading level={3} className="text-base font-semibold">Invite a Viatik account</Heading>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input id="invite-email" name="email" type="email" required placeholder="friend@example.com" />
            </div>
            <Button type="submit" variant="primary">Send invite</Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Invited Viatik accounts are added as <strong>Admin</strong> by default.
          </p>
        </form>
      )}

      {pendingInvitations.length > 0 && (
        <div className="rounded-2xl border bg-card p-5">
          <Heading level={3} className="text-base font-semibold">Pending invitations</Heading>
          <div className="mt-3 divide-y">
            {pendingInvitations.map((invitation) => (
              <div key={invitation.id} className="flex items-center gap-3 py-3 text-sm">
                <LinkIcon className="size-5 shrink-0 text-muted-foreground" />
                <span className="flex-1">{invitation.email}</span>
                <span className="capitalize text-muted-foreground">{invitation.role}</span>
                {canEdit && (
                  <Button variant="ghost" size="sm" onClick={() => void collaborationRepository.revokeInvitation(invitation.id)}>Revoke</Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <ContactEditorDialog
        key={editing?.id ?? (creating ? "new" : "closed")}
        open={creating || editing !== null}
        userId={userId}
        contact={editing}
        relationshipOnly={Boolean(editing?.linkedProfileId)}
        attachToTrip={creating}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
        onSaved={async (contact) => {
          if (!creating) return;
          try {
            await attachTraveler(contact);
          } catch (cause) {
            setMessage(cause instanceof Error ? cause.message : "Unable to add traveler.");
          }
        }}
      />
    </section>
  );
}

function AdminToggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-11 items-center gap-2 rounded-md px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className={cn("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200", checked ? "bg-primary" : "bg-muted")}>
        <span className={cn("inline-block size-4 rounded-full bg-background shadow transition-transform duration-200", checked ? "translate-x-6" : "translate-x-1")} />
      </span>
      <span className="text-xs font-semibold">{checked ? "Admin" : "Member"}</span>
    </button>
  );
}
