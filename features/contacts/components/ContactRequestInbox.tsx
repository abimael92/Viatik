"use client";

import { Check, Link2, Pencil, Send, Trash2, X } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { contactRepository } from "@/features/contacts/data/dexie-contact-repository";
import type { Contact } from "@/features/domain/entities";
import { cn } from "@/lib/utils";

type Tab = "contacts" | "requests";

const RING = "ring-1 ring-border ring-offset-2 ring-offset-background";

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
            { key: "requests", label: "Requests" },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            aria-label={key === "requests" && inbound.length ? `Requests, ${inbound.length} pending` : label}
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

      {tab === "requests" ? (
        inbound.length || outbound.length ? (
          <div className="space-y-6">
            {inbound.length > 0 && (
              <section className="space-y-3" aria-labelledby="inbound-requests-heading">
                <h2 id="inbound-requests-heading" className="text-sm font-semibold">Needs your response</h2>
                <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
                  {inbound.map((contact) => (
                    <div
                      key={contact.id}
                      className="flex w-32 shrink-0 flex-col items-center gap-2 rounded-2xl border border-border/40 bg-card p-3 text-center"
                    >
                      <UserAvatar seed={contact.avatarSeed} src={contact.linkedAvatarUrl} name={contact.fullName} size="md" />
                      <p className="w-full truncate text-sm font-semibold">{contact.fullName}</p>
                      <div className="flex gap-1.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Accept ${contact.fullName}`}
                          className="min-h-11 min-w-11 bg-success/10 text-success hover:bg-success/20"
                          onClick={() => void accept(contact)}
                        >
                          <Check className="size-5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Decline ${contact.fullName}`}
                          className="min-h-11 min-w-11 bg-destructive/10 text-destructive hover:bg-destructive/20"
                          onClick={() => void decline(contact)}
                        >
                          <X className="size-5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {outbound.length > 0 && (
              <section className="space-y-3" aria-labelledby="outbound-requests-heading">
                <h2 id="outbound-requests-heading" className="text-sm font-semibold">Sent requests</h2>
                <div className="divide-y rounded-2xl border bg-card">
                  {outbound.map((contact) => (
                    <div key={contact.id} className="flex items-center gap-4 p-4 opacity-70">
                      <span className={`rounded-full ${RING}`}>
                        <UserAvatar seed={contact.avatarSeed} src={contact.linkedAvatarUrl ?? contact.avatarUrl} name={contact.fullName} size="md" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{contact.fullName}</p>
                        <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                          <Send className="size-3" /> Request sent
                        </p>
                      </div>
                      <Button variant="ghost" size="icon" aria-label={`Remove ${contact.fullName}`} className="min-h-11 min-w-11" onClick={() => onRemove(contact)}>
                        <Trash2 className="size-5 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : (
          <p className="rounded-2xl border border-border/40 p-6 text-center text-sm text-muted-foreground">
            No pending requests.
          </p>
        )
      ) : (
        <div className="divide-y rounded-2xl border bg-card">
          {established.map((contact) => {
            const unverified = contact.connectionStatus === "unverified_offline";
            return (
              <div
                key={contact.id}
                className={cn(
                  "flex items-center gap-4 p-4 transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]",
                  unverified && "opacity-70"
                )}
              >
                <span className="rounded-full">
                  <UserAvatar
                    seed={contact.avatarSeed}
                    src={contact.linkedAvatarUrl ?? contact.avatarUrl}
                    name={contact.fullName}
                    size="md"
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold">{contact.fullName}</p>
                    {contact.connectionStatus === "accepted" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
                        <Link2 className="size-3" /> Connected
                      </span>
                    )}
                  </div>
                  <p className="text-xs capitalize text-muted-foreground">
                    {contact.relationship} · {contact.travelerType}
                    {contact.linkedHandle ? ` · @${contact.linkedHandle}` : ""}
                  </p>
                </div>
                <Button variant="ghost" size="icon" aria-label={`Edit ${contact.fullName}`} className="min-h-11 min-w-11" onClick={() => onEdit(contact)}>
                  <Pencil className="size-5" />
                </Button>
                <Button variant="ghost" size="icon" aria-label={`Remove ${contact.fullName}`} className="min-h-11 min-w-11" onClick={() => onRemove(contact)}>
                  <Trash2 className="size-5 text-destructive" />
                </Button>
              </div>
            );
          })}
          {!established.length && <p className="p-8 text-center text-sm text-muted-foreground">No contacts saved yet.</p>}
        </div>
      )}
    </div>
  );
}
