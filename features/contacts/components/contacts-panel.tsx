"use client";

import { UserPlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { useToast } from "@/components/ui/toast";
import { ContactDetailsDialog } from "@/features/contacts/components/contact-details-dialog";
import { ContactEditorDialog } from "@/features/contacts/components/contact-editor-dialog";
import { ContactRequestInbox } from "@/features/contacts/components/ContactRequestInbox";
import { contactRepository } from "@/features/contacts/data/dexie-contact-repository";
import type { CurrentPublicProfile } from "@/features/contacts/lib/profile-directory";
import type { Contact } from "@/features/domain/entities";

export function contactsPageContacts(contacts: Contact[]): Contact[] {
  return contacts.filter((contact) => Boolean(contact.linkedProfileId));
}

export function ContactsPanel({ userId, ownProfile }: { userId: string; ownProfile: CurrentPublicProfile }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [editing, setEditing] = useState<Contact | null | undefined>(undefined);
  const [viewing, setViewing] = useState<Contact | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const prevContactsRef = useRef<Contact[]>([]);

  useEffect(() => {
    const unsub = contactRepository.watch(userId, (newContacts) => {
      // Detect newly accepted outbound requests
      const prev = prevContactsRef.current;
      for (const contact of newContacts) {
        const old = prev.find((c) => c.id === contact.id);
        if (
          old &&
          old.connectionStatus === "pending" &&
          old.connectionDirection === "outbound" &&
          contact.connectionStatus === "accepted" &&
          contact.connectionDirection === null
        ) {
          toast({
            title: "Connection accepted",
            description: `${contact.fullName} accepted your request. You're now connected.`,
            variant: "success",
          });
        }
      }
      prevContactsRef.current = newContacts;
      setContacts(newContacts);
    });
    return unsub;
  }, [userId, toast]);

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
          <Heading level={1} className="text-3xl font-bold">Contacts</Heading>
          <p className="mt-1 text-muted-foreground">
            Mutual connections for shared trips and safe settlements. Private details are never exposed.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => setEditing(null)}>
            <UserPlus className="size-5" /> Add Contact
          </Button>
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

      <ContactRequestInbox
        ownerId={userId}
        contacts={contactsPageContacts(contacts)}
        onView={(contact) => setViewing(contact)}
        onEdit={(contact) => setEditing(contact)}
        onRemove={(contact) => void remove(contact)}
      />

      <ContactDetailsDialog
        open={viewing !== null}
        contact={viewing}
        onOpenChange={(open) => !open && setViewing(null)}
        onEdit={(contact) => {
          setViewing(null);
          setEditing(contact);
        }}
      />

      <ContactEditorDialog
        key={editing?.id ?? "new"}
        open={editing !== undefined}
        userId={userId}
        contact={editing}
        ownProfile={ownProfile}
        relationshipOnly={Boolean(editing?.linkedProfileId)}
        onOpenChange={(open) => !open && setEditing(undefined)}
      />
    </div>
  );
}
