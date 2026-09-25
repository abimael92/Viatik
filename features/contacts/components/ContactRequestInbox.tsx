"use client";

import { formatDistanceToNow } from "date-fns";
import { Inbox, Mail, Pencil, Phone, Trash2, Users } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { contactRepository } from "@/features/contacts/data/dexie-contact-repository";
import { FAMILY_ROLES, FAMILY_ROLE_LABELS, isFamilyRole } from "@/features/contacts/lib/family-roles";
import type { Contact } from "@/features/domain/entities";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { cn } from "@/lib/utils";

type Tab = "contacts" | "requests";

function relativeTime(isoDate: string) {
  return formatDistanceToNow(new Date(isoDate), { addSuffix: true });
}

const RELATIONSHIP_STYLES: Record<Contact["relationship"], string> = {
  family: "border-pink-200 bg-pink-100 text-pink-700 dark:border-pink-900/50 dark:bg-pink-950/40 dark:text-pink-300 [html[data-theme=light]_&]:!border-pink-300 [html[data-theme=light]_&]:!bg-pink-200 [html[data-theme=light]_&]:!text-pink-800",
  friend: "border-sky-200 bg-sky-100 text-sky-700 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-300 [html[data-theme=light]_&]:!border-sky-300 [html[data-theme=light]_&]:!bg-sky-200 [html[data-theme=light]_&]:!text-sky-800",
  coworker: "border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300 [html[data-theme=light]_&]:!border-amber-300 [html[data-theme=light]_&]:!bg-amber-200 [html[data-theme=light]_&]:!text-amber-800",
  roommate: "border-violet-200 bg-violet-100 text-violet-700 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-300 [html[data-theme=light]_&]:!border-violet-300 [html[data-theme=light]_&]:!bg-violet-200 [html[data-theme=light]_&]:!text-violet-800",
  other: "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300 [html[data-theme=light]_&]:!border-slate-300 [html[data-theme=light]_&]:!bg-slate-200 [html[data-theme=light]_&]:!text-slate-800",
};

export function ContactRequestInbox({
  ownerId,
  contacts,
  onView,
  onEdit,
  onRemove,
}: {
  ownerId: string;
  contacts: Contact[];
  onView?: (contact: Contact) => void;
  onEdit: (contact: Contact) => void;
  onRemove: (contact: Contact) => void;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("contacts");
  const [relationship, setRelationship] = useState("all");
  const inbound = contacts.filter(
    (contact) => contact.connectionStatus === "pending" && contact.connectionDirection === "inbound"
  );
  const outbound = contacts.filter(
    (contact) => contact.connectionStatus === "pending" && contact.connectionDirection === "outbound"
  );
  const established = contacts.filter(
    (contact) =>
      (contact.connectionStatus === "accepted" || contact.connectionStatus === "unverified_offline") &&
      (relationship === "all" ||
        (isFamilyRole(relationship)
          ? contact.relationship === "family" && contact.relationshipDetail === relationship
          : contact.relationship === relationship))
  );

  async function accept(contact: Contact) {
    await contactRepository.respondToConnectionRequest(contact.id, ownerId, true);
  }
  async function decline(contact: Contact) {
    await contactRepository.respondToConnectionRequest(contact.id, ownerId, false);
  }

  return (
    <div className="space-y-4">
      <div className="flex rounded-xl border border-border/40 bg-muted/40 p-1 sm:w-fit" role="tablist" aria-label={t("common.contactsViews")}>
        {(
          [
            { key: "contacts", label: t("common.myContacts") },
            { key: "requests", label: t("common.friendRequests") },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            aria-label={key === "requests" && inbound.length ? `${t("common.friendRequests")}, ${inbound.length} ${t("common.pendingRequestsCount")}` : label}
            onClick={() => setTab(key)}
            className={cn(
              "flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] sm:flex-none",
              tab === key
                ? "bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20 hover:bg-primary/15"
                : "text-muted-foreground hover:bg-primary/5 hover:text-primary"
            )}
          >
            {label}
            {key === "requests" && inbound.length > 0 && (
              <Badge variant="destructive" className="min-h-5 min-w-5 justify-center px-1.5 py-0 text-[10px] tracking-normal">
                {inbound.length}
              </Badge>
            )}
          </button>
        ))}
      </div>

      {tab === "contacts" ? (
        <>
        <select
          aria-label={t("common.relationship")}
          value={relationship}
          onChange={(event) => setRelationship(event.target.value)}
          className="h-10 rounded-lg border bg-background px-3 text-sm"
        >
          <option value="all">{t("common.all")}</option>
          <option value="family">{t("copy.family")}</option>
          {FAMILY_ROLES.map((role) => (
            <option key={role} value={role}>{t(FAMILY_ROLE_LABELS[role])}</option>
          ))}
          <option value="friend">{t("copy.friend")}</option>
          <option value="coworker">{t("copy.coworker")}</option>
          <option value="roommate">{t("copy.roommate")}</option>
          <option value="other">{t("common.other")}</option>
        </select>
        {established.length ? (
          <div className="space-y-3 rounded-2xl border bg-card p-3.5 sm:p-6">
            {established.map((contact) => (
              <div
                key={contact.id}
                role="button"
                tabIndex={0}
                aria-label={t("common.viewDetailsFor", { name: contact.fullName })}
                onClick={() => onView?.(contact)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onView?.(contact);
                  }
                }}
                className="group flex items-center justify-between gap-3 sm:gap-4 rounded-xl border border-border/80 bg-background p-3 sm:p-4 shadow-xs transition-all duration-200 hover:border-primary/40 hover:bg-muted/30 hover:shadow-sm cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-center gap-3 sm:gap-3.5 min-w-0 flex-1">
                  <div className="relative shrink-0">
                    <UserAvatar
                      seed={contact.avatarSeed}
                      src={contact.linkedAvatarUrl ?? contact.avatarUrl}
                      name={contact.fullName}
                      size="md"
                      className="size-10 sm:size-12 shadow-xs transition-all"
                    />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <p className="truncate text-sm sm:text-base font-semibold text-foreground group-hover:text-primary transition-colors">
                        {contact.fullName}
                      </p>
                      <Badge className={cn("text-[10px] font-semibold py-0.5 px-2", RELATIONSHIP_STYLES[contact.relationship])}>
                        {contact.relationship === "family" && contact.relationshipDetail && isFamilyRole(contact.relationshipDetail)
                          ? t(FAMILY_ROLE_LABELS[contact.relationshipDetail])
                          : t(contact.relationship === "family" ? "copy.family" : contact.relationship === "friend" ? "copy.friend" : contact.relationship === "coworker" ? "copy.coworker" : contact.relationship === "roommate" ? "copy.roommate" : "common.other")}
                      </Badge>
                      <Badge variant="muted" className="text-[10px] capitalize font-medium py-0.5 px-2">
                        {contact.travelerType}
                      </Badge>
                    </div>
                    {(contact.email || contact.phone) && (
                      <div className="flex flex-wrap items-center gap-x-3 sm:gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                        {contact.email && (
                          <span className="inline-flex items-center gap-1.5 truncate max-w-50 sm:max-w-none">
                            <Mail className="size-3.5 shrink-0" />
                            <span className="truncate">{contact.email}</span>
                          </span>
                        )}
                        {contact.phone && (
                          <span className="inline-flex items-center gap-1.5 truncate">
                            <Phone className="size-3.5 shrink-0" />
                            <span>{contact.phone}</span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div
                  className="flex shrink-0 items-center gap-1"
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("common.editContact", { name: contact.fullName })}
                    className="size-9 bg-yellow-50 text-yellow-700 hover:bg-yellow-100 hover:text-yellow-800 sm:size-10"
                    onClick={() => onEdit(contact)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("common.removeContact", { name: contact.fullName })}
                    className="size-9 sm:size-10 text-destructive/80 hover:text-destructive hover:bg-destructive/10"
                    onClick={() => onRemove(contact)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={<Users className="size-8" />} title={t("common.noContacts")} subtitle={t("common.addSomeone")} />
        )}
        </>
      ) : inbound.length || outbound.length ? (
        <div className="space-y-6 rounded-2xl border bg-card p-3.5 sm:p-6">
          {inbound.length > 0 && (
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("common.pendingRequests")}</h3>
              <div className="space-y-2">
                {inbound.map((contact) => (
                  <div
                    key={contact.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 rounded-xl border border-border/80 bg-background p-3.5 sm:p-4 shadow-xs"
                  >
                    <div className="flex items-center gap-3 sm:gap-3.5 min-w-0 flex-1">
                      <UserAvatar
                        seed={contact.avatarSeed}
                        src={contact.linkedAvatarUrl}
                        name={contact.fullName}
                        size="md"
                        className="size-10 sm:size-12 shrink-0 ring-1 ring-border shadow-xs"
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                          <p className="truncate text-sm sm:text-base font-semibold text-foreground">{contact.fullName}</p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {t("common.requested", { time: relativeTime(contact.createdAt) })}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2 w-full sm:w-auto">
                      <Button size="sm" variant="default" className="flex-1 sm:flex-none rounded-full px-4 min-h-9" onClick={() => void accept(contact)}>
                        {t("common.accept")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="flex-1 sm:flex-none rounded-full text-destructive hover:bg-destructive/10 min-h-9"
                        onClick={() => void decline(contact)}
                      >
                        {t("common.decline")}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
          {outbound.length > 0 && (
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("common.sentRequests")}</h3>
              <div className="space-y-2">
                {outbound.map((contact) => (
                  <div
                    key={contact.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 rounded-xl border border-border/80 bg-background p-3.5 sm:p-4 shadow-xs"
                  >
                    <div className="flex items-center gap-3 sm:gap-3.5 min-w-0 flex-1">
                      <UserAvatar
                        seed={contact.avatarSeed}
                        src={contact.linkedAvatarUrl ?? contact.avatarUrl}
                        name={contact.fullName}
                        size="md"
                        className="size-10 sm:size-12 shrink-0 ring-1 ring-border shadow-xs"
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                          <p className="truncate text-sm sm:text-base font-semibold text-foreground">{contact.fullName}</p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {t("common.requestSentAt", { time: relativeTime(contact.createdAt) })}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="w-full sm:w-auto rounded-full text-xs min-h-9"
                      onClick={() => onRemove(contact)}
                    >
                      {t("common.cancelRequest")}
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      ) : (
        <EmptyState icon={<Inbox className="size-8" />} title={t("common.noPendingRequests")} subtitle={t("common.requestsHere")} />
      )}
    </div>
  );
}

function EmptyState({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/60 px-6 py-16 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-muted text-muted-foreground">{icon}</span>
      <div className="space-y-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}
