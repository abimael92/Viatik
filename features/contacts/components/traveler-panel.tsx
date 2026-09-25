"use client";

import { localizeThrownError } from "@/lib/i18n/localize-error";

import Link from "next/link";
import { Pencil, Trash2, UserPlus, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { ContactEditorDialog } from "@/features/contacts/components/contact-editor-dialog";
import {
  contactRepository,
  tripTravelerRepository,
} from "@/features/contacts/data/dexie-contact-repository";
import type { Contact, TripTraveler } from "@/features/domain/entities";
import { useI18n } from "@/lib/i18n/i18n-provider";

export function TravelerPanel({
  tripId,
  userId,
  canEdit,
}: {
  tripId: string;
  userId: string;
  canEdit: boolean;
}) {
  const { t } = useI18n();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [travelers, setTravelers] = useState<TripTraveler[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
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
      setMessage(localizeThrownError(cause, t, "Unable to add traveler."));
    }
  }

  return (
    <section className="space-y-5">
      <div>
        <Heading level={2} className="text-2xl font-bold">{t("common.travelers")}</Heading>
        <p className="text-muted-foreground">
          {t("copy.vacationPeople")}
        </p>
      </div>
      <div className="rounded-xl border bg-muted/40 p-4 text-sm">
        <strong>{t("common.travelers")}</strong> {t("copy.travelersGoing")}{" "}
        <strong>{t("copy.collaborators")}</strong> {t("copy.collaboratorsHaveAccount")}
      </div>
      {message && (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {message}
        </p>
      )}
      <div className="divide-y rounded-2xl border bg-card">
        {travelers.map((traveler) => {
          const contact = contacts.find((item) => item.id === traveler.contactId);
          const canEditContact = canEdit && Boolean(contact && !contact.linkedProfileId);
          return (
            <div key={traveler.id} className="flex items-center gap-3 p-4">
              <div className="grid size-11 place-items-center rounded-full bg-primary/10 font-semibold text-primary">
                {traveler.displayName.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1">
                <p className="font-semibold">{traveler.displayName}</p>
                <p className="text-xs capitalize text-muted-foreground">{traveler.travelerType}</p>
              </div>
              {canEditContact && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("common.editContact", { name: traveler.displayName })}
                  onClick={() => setEditing(contact ?? null)}
                >
                  <Pencil className="size-5" />
                </Button>
              )}
              {canEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("common.removeContact", { name: traveler.displayName })}
                  onClick={() => void tripTravelerRepository.remove(traveler.id)}
                >
                  <Trash2 className="size-5 text-destructive" />
                </Button>
              )}
            </div>
          );
        })}
        {!travelers.length && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <Users className="mx-auto mb-2 size-7" />
            {t("copy.noNamedTravelers")}
          </div>
        )}
      </div>
      {canEdit && (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border bg-card p-5">
            <div className="flex items-center gap-2">
              <UserPlus className="size-5 text-primary" />
              <Heading level={3} className="text-base font-semibold">{t("common.addSomeoneNew")}</Heading>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("copy.contactSavedFuture")}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => setCreating(true)}>
                {t("copy.addNewContact")}
              </Button>
            </div>
          </div>
          <form onSubmit={attach} className="rounded-2xl border bg-card p-5">
            <Heading level={3} className="text-base font-semibold">{t("copy.addExistingContact")}</Heading>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("copy.reuseContact")}
            </p>
            <div className="mt-4 space-y-3">
              <select
                aria-label={t("copy.existingContact")}
                name="contactId"
                required
                defaultValue=""
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="" disabled>
                  {t("copy.selectContact")}
                </option>
                {available.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.fullName}
                  </option>
                ))}
              </select>
              <Button type="submit" variant="primary" disabled={!available.length}>
                {t("common.addTraveler")}
              </Button>
            </div>
            <Button asChild variant="link" className="mt-3 px-0">
              <Link href="/contacts">{t("copy.openContactsList")}</Link>
            </Button>
          </form>
        </div>
      )}
      <ContactEditorDialog
        key={editing?.id ?? (creating ? "new" : "closed")}
        open={creating || editing !== null}
        userId={userId}
        contact={editing}
        attachToTrip={creating}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
        onSaved={async (contact) => {
          if (!creating) return;
          await tripTravelerRepository.attach({
            id: crypto.randomUUID(),
            tripId,
            contact,
            createdBy: userId,
          });
        }}
      />
    </section>
  );
}
