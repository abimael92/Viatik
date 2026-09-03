"use client";

import { CalendarDays, ContactRound, Mail, ShieldCheck, UserRound } from "lucide-react";
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

function parseTags(value: FormDataEntryValue | null): string[] {
  return [...new Set(String(value ?? "").split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
}

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
      emergencyContactName: String(data.get("emergencyContactName") || ""),
      emergencyContactRelationship: String(data.get("emergencyContactRelationship") || ""),
      emergencyContactPhone: String(data.get("emergencyContactPhone") || ""),
      dietaryRestrictions: parseTags(data.get("dietaryRestrictions")),
      allergies: parseTags(data.get("allergies")),
      passportIssuingCountry: String(data.get("passportIssuingCountry") || ""),
      passportExpiresOn: String(data.get("passportExpiresOn") || "") || null,
      preferredCurrency: String(data.get("preferredCurrency") || "") || null,
      preferredLanguage: String(data.get("preferredLanguage") || "") || null,
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
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto p-0">
        <DialogHeader className="border-b bg-muted/30 px-6 pb-5 pt-6 text-left">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <ContactRound className="size-5" />
            </span>
            <div className="space-y-1.5">
              <DialogTitle>
                {contact ? "Edit contact" : attachToTrip ? "Add someone new" : "New contact"}
              </DialogTitle>
              <DialogDescription>
                {contact
                  ? "Keep their reusable travel profile and private details up to date."
                  : "Create a reusable travel profile for faster trip planning."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-6 px-6 pb-6 pt-6">
          <div className="flex gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <p className="font-medium">Private by default</p>
              <p className="mt-1 leading-5 text-muted-foreground">
                Only you can see email, phone, birth date, and notes. Travelers only see the name
                and traveler type attached to a trip.
              </p>
            </div>
          </div>

          <FormSection
            icon={<UserRound className="size-4" />}
            title="Identity"
            description="The details used to recognize this traveler across your trips."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Full name"
                name="fullName"
                defaultValue={contact?.fullName}
                placeholder="Jordan Rivera"
                helper="Required · shown to trip collaborators."
                required
                autoFocus
              />
              <SelectField
                label="Relationship"
                name="relationship"
                defaultValue={contact?.relationship ?? "other"}
                helper="Helps organize your private contacts."
              >
                <option value="family">Family</option>
                <option value="friend">Friend</option>
                <option value="coworker">Coworker</option>
                <option value="roommate">Roommate</option>
                <option value="other">Other</option>
              </SelectField>
              <SelectField
                label="Traveler type"
                name="travelerType"
                defaultValue={contact?.travelerType ?? "adult"}
                helper="Used for traveler counts and planning."
              >
                <option value="adult">Adult</option>
                <option value="child">Child</option>
              </SelectField>
            </div>
          </FormSection>

          <FormSection
            icon={<Mail className="size-4" />}
            title="Contact details"
            description="Optional details that remain private to your account."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="jordan@example.com"
                defaultValue={contact?.email ?? ""}
              />
              <Field
                label="Phone"
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+1 555 012 3456"
                defaultValue={contact?.phone ?? ""}
              />
            </div>
          </FormSection>

          <FormSection
            icon={<ShieldCheck className="size-4" />}
            title="Emergency contact"
            description="Private safety details for the person to contact during an emergency."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Contact name"
                name="emergencyContactName"
                placeholder="Taylor Rivera"
                defaultValue={contact?.emergencyContactName ?? ""}
              />
              <Field
                label="Relationship to traveler"
                name="emergencyContactRelationship"
                placeholder="Parent, partner, friend…"
                defaultValue={contact?.emergencyContactRelationship ?? ""}
              />
              <Field
                label="Emergency phone"
                name="emergencyContactPhone"
                type="tel"
                inputMode="tel"
                placeholder="+1 555 012 3456"
                defaultValue={contact?.emergencyContactPhone ?? ""}
              />
            </div>
          </FormSection>

          <FormSection
            icon={<CalendarDays className="size-4" />}
            title="Travel details"
            description="Optional context for planning age-aware activities and future trips."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Date of birth"
                name="birthDate"
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                helper="Private · useful for age requirements."
                defaultValue={contact?.birthDate ?? ""}
              />
              <Field
                label="Preferred language"
                name="preferredLanguage"
                placeholder="English"
                maxLength={35}
                defaultValue={contact?.preferredLanguage ?? ""}
              />
              <SelectField
                label="Preferred currency"
                name="preferredCurrency"
                defaultValue={contact?.preferredCurrency ?? ""}
              >
                <option value="">Not specified</option>
                <option value="USD">USD — US Dollar</option>
                <option value="EUR">EUR — Euro</option>
                <option value="GBP">GBP — British Pound</option>
                <option value="CAD">CAD — Canadian Dollar</option>
                <option value="MXN">MXN — Mexican Peso</option>
                <option value="JPY">JPY — Japanese Yen</option>
              </SelectField>
              <Field
                label="Dietary restrictions"
                name="dietaryRestrictions"
                placeholder="vegetarian, gluten-free"
                helper="Separate multiple items with commas."
                defaultValue={contact?.dietaryRestrictions.join(", ") ?? ""}
              />
              <Field
                label="Allergies"
                name="allergies"
                placeholder="nuts, shellfish"
                helper="Separate multiple items with commas."
                defaultValue={contact?.allergies.join(", ") ?? ""}
              />
              <Field
                label="Passport issuing country"
                name="passportIssuingCountry"
                placeholder="US"
                minLength={2}
                maxLength={2}
                helper="Two-letter country code only."
                defaultValue={contact?.passportIssuingCountry ?? ""}
              />
              <Field
                label="Passport expiration"
                name="passportExpiresOn"
                type="date"
                helper="No passport number is stored."
                defaultValue={contact?.passportExpiresOn ?? ""}
              />
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="contact-notes">Notes</Label>
                <p id="contact-notes-help" className="text-xs leading-5 text-muted-foreground">
                  Add dietary preferences, accessibility needs, or planning context. Avoid passport
                  numbers and other sensitive identity documents.
                </p>
                <textarea
                  id="contact-notes"
                  name="notes"
                  maxLength={500}
                  rows={3}
                  placeholder="Vegetarian, prefers aisle seats…"
                  defaultValue={contact?.notes ?? ""}
                  aria-describedby="contact-notes-help"
                  className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            </div>
          </FormSection>
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

function FormSection({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-xl border border-border/70 bg-card p-4 sm:p-5">
      <div className="flex items-start gap-3 border-b border-border/60 pb-4">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          {icon}
        </span>
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  name,
  helper,
  ...props
}: React.ComponentProps<typeof Input> & { label: string; name: string; helper?: string }) {
  const helperId = helper ? `contact-${name}-help` : undefined;
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
      {helper && (
        <p id={helperId} className="text-xs leading-5 text-muted-foreground">
          {helper}
        </p>
      )}
      <Input id={`contact-${name}`} name={name} aria-describedby={helperId} {...props} />
    </div>
  );
}
function SelectField({
  label,
  name,
  children,
  defaultValue,
  required,
  helper,
}: {
  label: string;
  name: string;
  children: React.ReactNode;
  defaultValue: string;
  required?: boolean;
  helper?: string;
}) {
  const helperId = helper ? `contact-${name}-help` : undefined;
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
      {helper && (
        <p id={helperId} className="text-xs leading-5 text-muted-foreground">
          {helper}
        </p>
      )}
      <select
        id={`contact-${name}`}
        name={name}
        defaultValue={defaultValue}
        aria-describedby={helperId}
        className="h-10 w-full rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {children}
      </select>
    </div>
  );
}
