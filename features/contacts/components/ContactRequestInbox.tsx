"use client";

import { formatDistanceToNow } from "date-fns";
import { Inbox, Pencil, Trash2, Users } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { contactRepository } from "@/features/contacts/data/dexie-contact-repository";
import type { Contact } from "@/features/domain/entities";
import { cn } from "@/lib/utils";

type Tab = "contacts" | "requests";

function relativeTime(isoDate: string) {
  return formatDistanceToNow(new Date(isoDate), { addSuffix: true });
}

export function ContactRequestInbox({
  ownerId,
  contacts,
  onEdit,
  onRemove,
}: {
  ownerId: string;
  contacts: Contact[];
  onEdit: (contact: Contact) => void;
  onRemove: (contact: Contact) => void;
}) {
  const [tab, setTab] = useState<Tab>("contacts");
  const inbound = contacts.filter(
    (contact) => contact.connectionStatus === "pending" && contact.connectionDirection === "inbound"
  );
  const outbound = contacts.filter(
    (contact) => contact.connectionStatus === "pending" && contact.connectionDirection === "outbound"
  );
  const established = contacts.filter(
    (contact) => contact.connectionStatus === "accepted" || contact.connectionStatus === "unverified_offline"
  );

  async function accept(contact: Contact) {
    await contactRepository.respondToConnectionRequest(contact.id, ownerId, true);
  }
  async function decline(contact: Contact) {
    await contactRepository.respondToConnectionRequest(contact.id, ownerId, false);
  }

  return (
    <div className="space-y-4">
      <div className="flex rounded-xl border border-border/40 bg-muted/40 p-1 sm:w-fit" role="tablist" aria-label="Contacts views">
        {(
          [
            { key: "contacts", label: "My Contacts" },
            { key: "requests", label: "Friend Requests" },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            aria-label={key === "requests" && inbound.length ? `Friend Requests, ${inbound.length} pending` : label}
            onClick={() => setTab(key)}
            className={cn(
              "flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] sm:flex-none",
              tab === key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
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
        established.length ? (
          <div className="space-y-1 rounded-2xl border bg-card p-5 sm:p-6">
            {established.map((contact) => (
              <div
                key={contact.id}
                className="flex items-center justify-between gap-4 rounded-xl border-b p-3 transition-colors last:border-0 hover:bg-muted/50"
              >
                <UserAvatar
                  seed={contact.avatarSeed}
                  src={contact.linkedAvatarUrl ?? contact.avatarUrl}
                  name={contact.fullName}
                  size="sm"
                  className="size-10"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{contact.fullName}</p>
                  <p className="truncate text-xs capitalize text-muted-foreground">
                    {contact.relationship} · {contact.travelerType}
                    {contact.linkedHandle ? ` · @${contact.linkedHandle}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon" aria-label={`Edit ${contact.fullName}`} onClick={() => onEdit(contact)}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label={`Remove ${contact.fullName}`} onClick={() => onRemove(contact)}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={<Users className="size-8" />} title="No contacts yet" subtitle="Add someone to start planning together." />
        )
      ) : inbound.length || outbound.length ? (
        <div className="rounded-2xl border bg-card p-5 sm:p-6">
          {inbound.length > 0 && (
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pending</h3>
              <div className="space-y-1">
                {inbound.map((contact) => (
                  <div key={contact.id} className="flex items-center gap-4 rounded-xl p-3">
                    <UserAvatar
                      seed={contact.avatarSeed}
                      src={contact.linkedAvatarUrl}
                      name={contact.fullName}
                      size="sm"
                      className="size-10"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{contact.fullName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        Requested {relativeTime(contact.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant="default" className="rounded-full px-4" onClick={() => void accept(contact)}>
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-full text-destructive hover:bg-destructive/10"
                        onClick={() => void decline(contact)}
                      >
                        Decline
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
          {outbound.length > 0 && (
            <section>
              <h3 className="mb-3 mt-6 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Requests</h3>
              <div className="space-y-1">
                {outbound.map((contact) => (
                  <div key={contact.id} className="flex items-center gap-4 rounded-xl p-3">
                    <UserAvatar
                      seed={contact.avatarSeed}
                      src={contact.linkedAvatarUrl ?? contact.avatarUrl}
                      name={contact.fullName}
                      size="sm"
                      className="size-10"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{contact.fullName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        Request sent {relativeTime(contact.createdAt)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="rounded-full text-xs"
                      onClick={() => onRemove(contact)}
                    >
                      Cancel
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      ) : (
        <EmptyState icon={<Inbox className="size-8" />} title="No pending requests" subtitle="Requests you send or receive will show up here." />
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
