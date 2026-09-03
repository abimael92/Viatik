"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { contactRepository } from "@/features/contacts/data/dexie-contact-repository";
import type { Contact, TravelerType, Trip } from "@/features/domain/entities";

export function ContactEditorDialog({
  open,
  userId,
  contact,
  onOpenChange,
  onSaved,
  attachToTrip,
}: {
  open: boolean;
  userId: string;
  contact?: Contact | null;
  onOpenChange: (open: boolean) => void;
  onSaved?: (contact: Contact) => Promise<void> | void;
  attachToTrip?: boolean;
}) {
  const operation = contact ? "edit" : "create";
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upcoming, setUpcoming] = useState<Trip[]>([]);
  const [propagate, setPropagate] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const fullName = String(data.get("fullName") || "").trim();
    if (fullName.length < 2) return setError("Enter a full name with at least 2 characters.");
    const values = {
      fullName,
      email: String(data.get("email") || ""),
      phone: String(data.get("phone") || ""),
      relationship: String(data.get("relationship")) as Contact["relationship"],
      travelerType: String(data.get("travelerType")) as TravelerType,
      birthDate: String(data.get("birthDate") || "") || null,
      notes: String(data.get("notes") || ""),
    };
    const snapshotsChanged = Boolean(
      contact && (contact.fullName !== fullName || contact.travelerType !== values.travelerType)
    );
    if (snapshotsChanged && !upcoming.length) {
      setPending(true);
      try {
        const trips = await contactRepository.listUpcomingTrips(contact!.id, userId);
        if (trips.length) {
          setUpcoming(trips);
          setSelected(trips.map((trip) => trip.id));
          return;
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Unable to check upcoming trips.");
        return;
      } finally {
        setPending(false);
      }
    }
    setPending(true);
    setError(null);
    try {
      const saved = contact
        ? await contactRepository.update(contact.id, userId, values, propagate ? selected : [])
        : await contactRepository.create({ id: crypto.randomUUID(), ownerId: userId, ...values });
      await onSaved?.(saved);
      onOpenChange(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : operation === "edit"
            ? "Unable to update contact."
            : "Unable to create contact."
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !pending && onOpenChange(value)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {contact ? "Edit contact" : attachToTrip ? "Add someone new" : "New contact"}
          </DialogTitle>
          <DialogDescription>
            {contact
              ? "Update private contact details saved on this device."
              : "Save private details you can reuse for future trips."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Full name"
              name="fullName"
              defaultValue={contact?.fullName}
              required
              autoFocus
            />
            <Field label="Email" name="email" type="email" defaultValue={contact?.email ?? ""} />
            <Field label="Phone" name="phone" type="tel" defaultValue={contact?.phone ?? ""} />
            <SelectField
              label="Relationship"
              name="relationship"
              defaultValue={contact?.relationship ?? "other"}
            >
              <option value="family">Family</option>
              <option value="friend">Friend</option>
              <option value="coworker">Coworker</option>
              <option value="other">Other</option>
            </SelectField>
            <SelectField
              label="Traveler type"
              name="travelerType"
              defaultValue={contact?.travelerType ?? "adult"}
            >
              <option value="adult">Adult</option>
              <option value="child">Child</option>
            </SelectField>
            <Field
              label="Date of birth"
              name="birthDate"
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              defaultValue={contact?.birthDate ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact-notes">Notes</Label>
            <p id="contact-notes-help" className="text-xs text-muted-foreground">
              Avoid storing passport numbers or other sensitive identity documents.
            </p>
            <textarea
              id="contact-notes"
              name="notes"
              maxLength={500}
              rows={3}
              defaultValue={contact?.notes ?? ""}
              aria-describedby="contact-notes-help"
              className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          {upcoming.length > 0 && (
            <fieldset className="space-y-3 rounded-lg border p-3">
              <legend className="px-1 text-sm font-medium">Update upcoming trips?</legend>
              <label className="flex gap-2 text-sm">
                <input
                  type="radio"
                  name="propagation"
                  checked={!propagate}
                  onChange={() => setPropagate(false)}
                />
                Contact only
              </label>
              <label className="flex gap-2 text-sm">
                <input
                  type="radio"
                  name="propagation"
                  checked={propagate}
                  onChange={() => setPropagate(true)}
                />
                Update traveler snapshots
              </label>
              {propagate && (
                <div className="ml-5 space-y-2">
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0"
                    onClick={() =>
                      setSelected(
                        selected.length === upcoming.length ? [] : upcoming.map((trip) => trip.id)
                      )
                    }
                  >
                    {selected.length === upcoming.length ? "Clear all" : "Select all"}
                  </Button>
                  {upcoming.map((trip) => (
                    <label key={trip.id} className="flex gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selected.includes(trip.id)}
                        onChange={(event) =>
                          setSelected(
                            event.target.checked
                              ? [...selected, trip.id]
                              : selected.filter((id) => id !== trip.id)
                          )
                        }
                      />
                      {trip.name}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
          )}
          {error && (
            <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending
                ? operation === "edit"
                  ? "Updating…"
                  : "Creating…"
                : contact
                  ? "Update contact"
                  : attachToTrip
                    ? "Save and add"
                    : "Save contact"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  name,
  ...props
}: React.ComponentProps<typeof Input> & { label: string; name: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-0.5">
        <Label htmlFor={`contact-${name}`}>{label}</Label>
        {props.required && (
          <span className="text-destructive" aria-hidden="true">
            *
          </span>
        )}
      </div>
      <Input id={`contact-${name}`} name={name} {...props} />
    </div>
  );
}
function SelectField({
  label,
  name,
  children,
  defaultValue,
  required,
}: {
  label: string;
  name: string;
  children: React.ReactNode;
  defaultValue: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-0.5">
        <Label htmlFor={`contact-${name}`}>{label}</Label>
        {required && (
          <span className="text-destructive" aria-hidden="true">
            *
          </span>
        )}
      </div>
      <select
        id={`contact-${name}`}
        name={name}
        defaultValue={defaultValue}
        className="h-10 w-full rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {children}
      </select>
    </div>
  );
}
