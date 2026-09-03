"use client";

import Link from "next/link";
import { Trash2, UserPlus, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { ContactEditorDialog } from "@/features/contacts/components/contact-editor-dialog";
import {
  contactRepository,
  tripTravelerRepository,
} from "@/features/contacts/data/dexie-contact-repository";
import type { Contact, TripTraveler } from "@/features/domain/entities";

export function TravelerPanel({
  tripId,
  userId,
  canEdit,
}: {
  tripId: string;
  userId: string;
  canEdit: boolean;
}) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [travelers, setTravelers] = useState<TripTraveler[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  useEffect(() => contactRepository.watch(userId, setContacts), [userId]);
  useEffect(() => tripTravelerRepository.watch(tripId, setTravelers), [tripId]);
  const available = useMemo(
    () =>
      contacts.filter(
        (contact) => !travelers.some((traveler) => traveler.contactId === contact.id)
      ),
    [contacts, travelers]
  );

  async function attach(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const contact = contacts.find((item) => item.id === new FormData(form).get("contactId"));
    if (!contact) return;
    try {
      await tripTravelerRepository.attach({
        id: crypto.randomUUID(),
        tripId,
        contact,
        createdBy: userId,
      });
      form.reset();
      setMessage(null);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to add traveler.");
    }
  }

  async function attachCreated(contact: Contact) {
    await tripTravelerRepository.attach({
      id: crypto.randomUUID(),
      tripId,
      contact,
      createdBy: userId,
    });
    setMessage(null);
  }

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold">Travelers</h2>
        <p className="text-muted-foreground">
          People going on this vacation. Everyone can see their names; their email and phone stay
          private to you.
        </p>
      </div>
      <div className="rounded-xl border bg-muted/40 p-4 text-sm">
        <strong>Travelers</strong> are going on the trip. <strong>Collaborators</strong> have a
        Viatik account and permission to view or edit the trip.
      </div>
      {message && (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {message}
        </p>
      )}
      <div className="divide-y rounded-2xl border bg-card">
        {travelers.map((traveler) => (
          <div key={traveler.id} className="flex items-center gap-3 p-4">
            <div className="grid size-11 place-items-center rounded-full bg-primary/10 font-semibold text-primary">
              {traveler.displayName.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1">
              <p className="font-medium">{traveler.displayName}</p>
              <p className="text-xs capitalize text-muted-foreground">{traveler.travelerType}</p>
            </div>
            {canEdit && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove ${traveler.displayName}`}
                onClick={() => void tripTravelerRepository.remove(traveler.id)}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            )}
          </div>
        ))}
        {!travelers.length && (
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
              <h3 className="font-semibold">Add someone new</h3>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Their contact is saved privately for future trips.
            </p>
            <Button className="mt-4" onClick={() => setCreating(true)}>
              Add new contact
            </Button>
          </div>
          <form onSubmit={attach} className="rounded-2xl border bg-card p-5">
            <h3 className="font-semibold">Add an existing contact</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Reuse someone already in your private contacts.
            </p>
            <div className="mt-4 space-y-3">
              <select
                aria-label="Existing contact"
                name="contactId"
                required
                defaultValue=""
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="" disabled>
                  Select a contact
                </option>
                {available.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.fullName}
                  </option>
                ))}
              </select>
              <Button type="submit" disabled={!available.length}>
                Add traveler
              </Button>
            </div>
            <Button asChild variant="link" className="mt-3 px-0">
              <Link href="/contacts">Open contacts list</Link>
            </Button>
          </form>
        </div>
      )}
      <ContactEditorDialog
        key={creating ? "new" : "closed"}
        open={creating}
        userId={userId}
        attachToTrip
        onOpenChange={setCreating}
        onSaved={attachCreated}
      />
    </section>
  );
}
