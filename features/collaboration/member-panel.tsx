"use client";

import { MailPlus, Trash2, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserAvatar } from "@/components/ui/user-avatar";
import { collaborationRepository } from "@/features/collaboration/data/dexie-collaboration-repository";
import type { ProfileSummary, TripInvitation, TripMember } from "@/features/domain/entities";

export function MemberPanel({ tripId, userId }: { tripId: string; userId: string }) {
  const [members, setMembers] = useState<TripMember[]>([]);
  const [invitations, setInvitations] = useState<TripInvitation[]>([]);
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => collaborationRepository.watchMembers(tripId, setMembers), [tripId]);
  useEffect(() => collaborationRepository.watchInvitations(tripId, setInvitations), [tripId]);
  useEffect(() => { void collaborationRepository.listProfiles(members.map((member) => member.userId)).then(setProfiles).catch(() => setProfiles([])); }, [members]);
  const currentMember = members.find((member) => member.userId === userId);
  const canManage = currentMember?.role === "owner" || currentMember?.role === "editor";
  const profileById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);

  async function invite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await collaborationRepository.invite({ id: crypto.randomUUID(), tripId, email: String(data.get("email")), role: String(data.get("role")) as "editor" | "viewer", invitedBy: userId });
      event.currentTarget.reset();
      setMessage("Invitation queued and will sync automatically.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to invite collaborator.");
    }
  }

  return <section className="space-y-5"><div><h2 className="text-2xl font-bold">Collaborators</h2><p className="text-muted-foreground">Manage access and roles for this trip.</p></div>{message && <p role="status" className="rounded-lg border bg-card p-3 text-sm">{message}</p>}
    <div className="divide-y rounded-2xl border bg-card">{members.map((member) => { const profile = profileById.get(member.userId); return <div key={member.id} className="flex flex-wrap items-center gap-3 p-4"><UserAvatar seed={member.userId} src={profile?.avatarUrl} name={profile?.fullName} size="md" status={member.userId === userId ? "online" : undefined} /><div className="min-w-0 flex-1"><p className="truncate font-medium">{member.userId === userId ? "You" : profile?.fullName ?? "Collaborator"}</p><p className="truncate text-xs text-muted-foreground">{member.userId}</p></div>{currentMember?.role === "owner" && member.role !== "owner" ? <select aria-label={`Role for ${profile?.fullName ?? member.userId}`} value={member.role} onChange={(event) => void collaborationRepository.updateMemberRole(member.id, event.target.value as "editor" | "viewer")} className="h-9 rounded-md border bg-background px-2 text-sm"><option value="editor">Editor</option><option value="viewer">Viewer</option></select> : <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium capitalize">{member.role}</span>}{currentMember?.role === "owner" && member.role !== "owner" && <Button variant="ghost" size="icon" aria-label="Remove member" onClick={() => void collaborationRepository.removeMember(member.id)}><Trash2 className="size-4 text-destructive" /></Button>}</div>; })}{!members.length && <div className="p-8 text-center text-sm text-muted-foreground"><Users className="mx-auto mb-2 size-7" />Members will appear after cloud synchronization.</div>}</div>
    {canManage && <form onSubmit={invite} className="rounded-2xl border bg-card p-5"><div className="flex items-center gap-2"><MailPlus className="size-5 text-primary" /><h3 className="font-semibold">Invite a collaborator</h3></div><div className="mt-4 grid gap-3 sm:grid-cols-[1fr_9rem_auto] sm:items-end"><div className="space-y-2"><Label htmlFor="invite-email">Email</Label><Input id="invite-email" name="email" type="email" required placeholder="friend@example.com" /></div><div className="space-y-2"><Label htmlFor="invite-role">Role</Label><select id="invite-role" name="role" className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="editor">Editor</option><option value="viewer">Viewer</option></select></div><Button type="submit">Send invite</Button></div></form>}
    {invitations.some((invitation) => invitation.status === "pending") && <div className="rounded-2xl border bg-card p-5"><h3 className="font-semibold">Pending invitations</h3><div className="mt-3 divide-y">{invitations.filter((invitation) => invitation.status === "pending").map((invitation) => <div key={invitation.id} className="flex items-center gap-3 py-3 text-sm"><span className="flex-1">{invitation.email}</span><span className="capitalize text-muted-foreground">{invitation.role}</span>{canManage && <Button variant="ghost" size="sm" onClick={() => void collaborationRepository.revokeInvitation(invitation.id)}>Revoke</Button>}</div>)}</div></div>}
  </section>;
}
