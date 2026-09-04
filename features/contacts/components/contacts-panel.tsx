"use client";

import { Link2, Pencil, Trash2, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ContactEditorDialog } from "@/features/contacts/components/contact-editor-dialog";
import { ViatikContactImportDialog } from "@/features/contacts/components/viatik-contact-import-dialog";
import { contactRepository } from "@/features/contacts/data/dexie-contact-repository";
import type { Contact } from "@/features/domain/entities";

export function ContactsPanel({ userId }: { userId: string }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [editing, setEditing] = useState<Contact | null | undefined>(undefined);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => contactRepository.watch(userId, setContacts), [userId]);

  async function remove(contact: Contact) {
    setError(null);
    try {
      await contactRepository.remove(contact.id, userId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to remove contact.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Contacts</h1>
          <p className="mt-1 text-muted-foreground">
            Keep private, reusable details for friends, family, and other travelers.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setLinking(true)}>
            <Link2 className="size-4" /> Link Viatik account
          </Button>
          <Button onClick={() => setEditing(null)}>
            <UserPlus className="size-4" /> New contact
          </Button>
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

      <div className="divide-y rounded-2xl border bg-card">
        {contacts.map((contact) => (
          <div key={contact.id} className="flex items-center gap-4 p-4">
            <div className="grid size-11 place-items-center overflow-hidden rounded-full bg-primary/10 font-semibold text-primary">
              {contact.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={contact.avatarUrl} alt="" className="size-full object-cover" />
              ) : (
                contact.fullName.slice(0, 2).toUpperCase()
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate font-medium">{contact.fullName}</p>
                {contact.linkedProfileId && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
                    <Link2 className="size-3" /> Linked
                  </span>
                )}
              </div>
              <p className="text-xs capitalize text-muted-foreground">
                {contact.relationship} · {contact.travelerType}
                {contact.linkedHandle ? ` · @${contact.linkedHandle}` : ""}
              </p>
            </div>
            <Button variant="ghost" size="icon" aria-label={`Edit ${contact.fullName}`} onClick={() => setEditing(contact)}>
              <Pencil className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" aria-label={`Remove ${contact.fullName}`} onClick={() => void remove(contact)}>
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
        ))}
        {!contacts.length && <p className="p-8 text-center text-sm text-muted-foreground">No contacts saved yet.</p>}
      </div>

      <ContactEditorDialog
        key={editing?.id ?? "new"}
        open={editing !== undefined}
        userId={userId}
        contact={editing}
        onOpenChange={(open) => !open && setEditing(undefined)}
      />
      <ViatikContactImportDialog
        open={linking}
        userId={userId}
        onOpenChange={setLinking}
      />
    </div>
  );
}
