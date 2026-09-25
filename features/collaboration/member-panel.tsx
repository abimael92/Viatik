"use client";

import { localizeThrownError } from "@/lib/i18n/localize-error";

import { MailPlus, Trash2, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserAvatar } from "@/components/ui/user-avatar";
import { collaborationRepository } from "@/features/collaboration/data/dexie-collaboration-repository";
import type { ProfileSummary, TripInvitation, TripMember } from "@/features/domain/entities";
import { useI18n } from "@/lib/i18n/i18n-provider";

export function MemberPanel({ tripId, userId }: { tripId: string; userId: string }) {
  const { t } = useI18n();
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
      setMessage(t("copy.invitationQueued"));
    } catch (error) {
      setMessage(localizeThrownError(error, t, "Unable to invite collaborator."));
    }
  }

  return <section className="space-y-5"><div><Heading level={2} className="text-2xl font-bold">{t("copy.collaborators")}</Heading><p className="text-muted-foreground">{t("copy.manageAccess")}</p></div>{message && <p role="status" className="rounded-lg border bg-card p-3 text-sm">{message}</p>}
    <div className="divide-y rounded-2xl border bg-card">{members.map((member) => { const profile = profileById.get(member.userId); return <div key={member.id} className="flex flex-wrap items-center gap-3 p-4"><UserAvatar seed={member.userId} src={profile?.avatarUrl} name={profile?.fullName} size="md" status={member.userId === userId ? "online" : undefined} /><div className="min-w-0 flex-1"><p className="truncate font-semibold">{member.userId === userId ? t("common.you") : profile?.fullName ?? "Collaborator"}</p><p className="truncate text-xs text-muted-foreground">{member.userId}</p></div>{currentMember?.role === "owner" && member.role !== "owner" ? <select aria-label={`${t("common.role")} for ${profile?.fullName ?? member.userId}`} value={member.role} onChange={(event) => void collaborationRepository.updateMemberRole(member.id, event.target.value as "editor" | "viewer")} className="h-9 rounded-md border bg-background px-2 text-sm"><option value="editor">{t("copy.editor")}</option><option value="viewer">{t("copy.viewer")}</option></select> : <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold capitalize">{member.role}</span>}{currentMember?.role === "owner" && member.role !== "owner" && <Button variant="ghost" size="icon" aria-label={t("copy.removeMember")} onClick={() => void collaborationRepository.removeMember(member.id)}><Trash2 className="size-5 text-destructive" /></Button>}</div>; })}{!members.length && <div className="p-8 text-center text-sm text-muted-foreground"><Users className="mx-auto mb-2 size-7" />{t("copy.membersAfterSync")}</div>}</div>
    {canManage && <form onSubmit={invite} className="rounded-2xl border bg-card p-5"><div className="flex items-center gap-2"><MailPlus className="size-5 text-primary" /><Heading level={3} className="text-base font-semibold">{t("copy.inviteCollaborator")}</Heading></div><div className="mt-4 grid gap-3 sm:grid-cols-[1fr_9rem_auto] sm:items-end"><div className="space-y-2"><Label htmlFor="invite-email">{t("copy.email")}</Label><Input id="invite-email" name="email" type="email" required placeholder={t("copy.placeholderFriendEmail")} /></div><div className="space-y-2"><Label htmlFor="invite-role">{t("common.role")}</Label><select id="invite-role" name="role" className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="editor">{t("copy.editor")}</option><option value="viewer">{t("copy.viewer")}</option></select></div><Button type="submit" variant="primary">{t("copy.sendInvite")}</Button></div></form>}
    {invitations.some((invitation) => invitation.status === "pending") && <div className="rounded-2xl border bg-card p-5"><Heading level={3} className="text-base font-semibold">{t("copy.pendingInvitations")}</Heading><div className="mt-3 divide-y">{invitations.filter((invitation) => invitation.status === "pending").map((invitation) => <div key={invitation.id} className="flex items-center gap-3 py-3 text-sm"><span className="flex-1">{invitation.email}</span><span className="capitalize text-muted-foreground">{invitation.role}</span>{canManage && <Button variant="ghost" size="sm" onClick={() => void collaborationRepository.revokeInvitation(invitation.id)}>{t("copy.revoke")}</Button>}</div>)}</div></div>}
  </section>;
}
