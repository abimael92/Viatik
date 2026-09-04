"use client";

import { CalendarDays, ContactRound, Mail, ShieldCheck, UserRound } from "lucide-react";
import { useState } from "react";

import { AvatarPicker, fileToDataUrl, type AvatarChange } from "@/components/ui/avatar-picker";
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
import { cn } from "@/lib/utils";

const STEPS = ["Identity", "Contact details", "Travel details"];

function parseTags(value: string): string[] {
  return [...new Set(value.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
}

type ContactFormValues = {
  fullName: string;
  avatarUrl: string | null;
  relationship: Contact["relationship"];
  travelerType: TravelerType;
  email: string;
  phone: string;
  emergencyContactName: string;
  emergencyContactRelationship: string;
  emergencyContactPhone: string;
  birthDate: string;
  preferredLanguage: string;
  preferredCurrency: string;
  dietaryRestrictions: string;
  allergies: string;
  passportIssuingCountry: string;
  passportExpiresOn: string;
  notes: string;
};

function contactToValues(contact?: Contact | null): ContactFormValues {
  return {
    fullName: contact?.fullName ?? "",
    avatarUrl: contact?.avatarUrl ?? null,
    relationship: contact?.relationship ?? "other",
    travelerType: contact?.travelerType ?? "adult",
    email: contact?.email ?? "",
    phone: contact?.phone ?? "",
    emergencyContactName: contact?.emergencyContactName ?? "",
    emergencyContactRelationship: contact?.emergencyContactRelationship ?? "",
    emergencyContactPhone: contact?.emergencyContactPhone ?? "",
    birthDate: contact?.birthDate ?? "",
    preferredLanguage: contact?.preferredLanguage ?? "",
    preferredCurrency: contact?.preferredCurrency ?? "",
    dietaryRestrictions: contact?.dietaryRestrictions.join(", ") ?? "",
    allergies: contact?.allergies.join(", ") ?? "",
    passportIssuingCountry: contact?.passportIssuingCountry ?? "",
    passportExpiresOn: contact?.passportExpiresOn ?? "",
    notes: contact?.notes ?? "",
  };
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
  const [pending, setPending] = useState(false);

  return (
    <Dialog open={open} onOpenChange={(value) => !pending && onOpenChange(value)}>
      {/* Conditionally mounting the form resets all step/field state on each open. */}
      {open && (
        <ContactForm
          userId={userId}
          contact={contact}
          attachToTrip={attachToTrip}
          onOpenChange={onOpenChange}
          onSaved={onSaved}
          pending={pending}
          setPending={setPending}
        />
      )}
    </Dialog>
  );
}

function ContactForm({
  userId,
  contact,
  attachToTrip,
  onOpenChange,
  onSaved,
  pending,
  setPending,
}: {
  userId: string;
  contact?: Contact | null;
  attachToTrip?: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (contact: Contact) => Promise<void> | void;
  pending: boolean;
  setPending: (pending: boolean) => void;
}) {
  const operation = contact ? "edit" : "create";
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [values, setValues] = useState<ContactFormValues>(() => contactToValues(contact));
  const [upcoming, setUpcoming] = useState<Trip[]>([]);
  const [propagate, setPropagate] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  // Step 1 is the starting point; later steps are marked visited as the user
  // actually reaches them. Submission is only allowed once every step is visited.
  const [visited, setVisited] = useState<boolean[]>(() => [
    true,
    ...Array(STEPS.length - 1).fill(false),
  ]);
  const allVisited = visited.every(Boolean);

  function setField<K extends keyof ContactFormValues>(key: K, value: ContactFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function handleAvatarChange(change: AvatarChange) {
    if (change.file) {
      void fileToDataUrl(change.file).then(
        (url) => setField("avatarUrl", url),
        () => setError("The selected image could not be read.")
      );
      return;
    }
    setField("avatarUrl", change.value);
  }

  function goToStep(target: number) {
    setNotice(null);
    setFieldErrors({});
    setVisited((current) =>
      current.map((visitedStep, index) => (index === target - 1 ? true : visitedStep))
    );
    setStep(target);
  }

  function validateStep(targetStep: number): Record<string, string> {
    const errors: Record<string, string> = {};
    if (targetStep === 1) {
      const name = values.fullName.trim();
      if (name.length < 2) errors.fullName = "Enter at least 2 characters.";
      else if (name.length > 100) errors.fullName = "Use no more than 100 characters.";
    }
    return errors;
  }

  function focusFirstError(errors: Record<string, string>) {
    for (const key of Object.keys(errors)) {
      const element = document.getElementById(`contact-${key}`);
      if (element instanceof HTMLElement) {
        element.focus();
        break;
      }
    }
  }

  function handleNext() {
    const errors = validateStep(step);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      focusFirstError(errors);
      return;
    }
    goToStep(step + 1);
  }

  /** Direct step navigation from the clickable progress header. */
  function handleStepNavigate(target: number) {
    if (target === step) return;
    if (target < step) {
      goToStep(target);
      return;
    }
    // Forward jumps require every preceding step to have been visited so the
    // flow is mandatory: you can't skip ahead to submit.
    const skipped = STEPS.slice(0, target - 1).some((_, index) => !visited[index]);
    if (skipped) {
      const firstUnvisited = visited.findIndex((visitedStep) => !visitedStep);
      setNotice(
        firstUnvisited === -1
          ? null
          : `Complete ${STEPS[firstUnvisited]} before moving on.`
      );
      return;
    }
    goToStep(target);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fullName = values.fullName.trim();
    if (fullName.length < 2) {
      const errors = { fullName: "Enter a full name with at least 2 characters." };
      setFieldErrors(errors);
      focusFirstError(errors);
      return;
    }
    const data = {
      fullName,
      avatarUrl: values.avatarUrl,
      email: values.email,
      phone: values.phone,
      relationship: values.relationship,
      travelerType: values.travelerType,
      birthDate: values.birthDate || null,
      notes: values.notes,
      emergencyContactName: values.emergencyContactName,
      emergencyContactRelationship: values.emergencyContactRelationship,
      emergencyContactPhone: values.emergencyContactPhone,
      dietaryRestrictions: parseTags(values.dietaryRestrictions),
      allergies: parseTags(values.allergies),
      passportIssuingCountry: values.passportIssuingCountry,
      passportExpiresOn: values.passportExpiresOn || null,
      preferredCurrency: values.preferredCurrency || null,
      preferredLanguage: values.preferredLanguage || null,
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
        ? await contactRepository.update(contact.id, userId, data, propagate ? selected : [])
        : await contactRepository.create({ id: crypto.randomUUID(), ownerId: userId, ...data });
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
        <StepHeader step={step} onNavigate={handleStepNavigate} />

        {step === 1 && (
          <div className="space-y-6">
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
              <AvatarPicker
                value={values.avatarUrl}
                name={values.fullName}
                onChange={handleAvatarChange}
                uploadHint="Optional · pick a preset or upload a photo."
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Full name"
                  name="fullName"
                  value={values.fullName}
                  onChange={(event) => setField("fullName", event.target.value)}
                  error={fieldErrors.fullName}
                  placeholder="Jordan Rivera"
                  helper="Required · shown to trip collaborators."
                  required
                  autoFocus
                />
                <SelectField
                  label="Relationship"
                  name="relationship"
                  value={values.relationship}
                  onChange={(event) =>
                    setField("relationship", event.target.value as Contact["relationship"])
                  }
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
                  value={values.travelerType}
                  onChange={(event) => setField("travelerType", event.target.value as TravelerType)}
                  helper="Used for traveler counts and planning."
                >
                  <option value="adult">Adult</option>
                  <option value="child">Child</option>
                </SelectField>
              </div>
            </FormSection>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
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
                  value={values.email}
                  onChange={(event) => setField("email", event.target.value)}
                  placeholder="jordan@example.com"
                />
                <Field
                  label="Phone"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={values.phone}
                  onChange={(event) => setField("phone", event.target.value)}
                  placeholder="+1 555 012 3456"
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
                  value={values.emergencyContactName}
                  onChange={(event) => setField("emergencyContactName", event.target.value)}
                  placeholder="Taylor Rivera"
                />
                <Field
                  label="Relationship to traveler"
                  name="emergencyContactRelationship"
                  value={values.emergencyContactRelationship}
                  onChange={(event) =>
                    setField("emergencyContactRelationship", event.target.value)
                  }
                  placeholder="Parent, partner, friend…"
                />
                <Field
                  label="Emergency phone"
                  name="emergencyContactPhone"
                  type="tel"
                  inputMode="tel"
                  value={values.emergencyContactPhone}
                  onChange={(event) => setField("emergencyContactPhone", event.target.value)}
                  placeholder="+1 555 012 3456"
                />
              </div>
            </FormSection>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
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
                  value={values.birthDate}
                  onChange={(event) => setField("birthDate", event.target.value)}
                  max={new Date().toISOString().slice(0, 10)}
                  helper="Private · useful for age requirements."
                />
                <Field
                  label="Preferred language"
                  name="preferredLanguage"
                  value={values.preferredLanguage}
                  onChange={(event) => setField("preferredLanguage", event.target.value)}
                  placeholder="English"
                  maxLength={35}
                />
                <SelectField
                  label="Preferred currency"
                  name="preferredCurrency"
                  value={values.preferredCurrency}
                  onChange={(event) => setField("preferredCurrency", event.target.value)}
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
                  value={values.dietaryRestrictions}
                  onChange={(event) => setField("dietaryRestrictions", event.target.value)}
                  placeholder="vegetarian, gluten-free"
                  helper="Separate multiple items with commas."
                />
                <Field
                  label="Allergies"
                  name="allergies"
                  value={values.allergies}
                  onChange={(event) => setField("allergies", event.target.value)}
                  placeholder="nuts, shellfish"
                  helper="Separate multiple items with commas."
                />
                <Field
                  label="Passport issuing country"
                  name="passportIssuingCountry"
                  value={values.passportIssuingCountry}
                  onChange={(event) => setField("passportIssuingCountry", event.target.value)}
                  placeholder="US"
                  minLength={2}
                  maxLength={2}
                  helper="Two-letter country code only."
                />
                <Field
                  label="Passport expiration"
                  name="passportExpiresOn"
                  type="date"
                  value={values.passportExpiresOn}
                  onChange={(event) => setField("passportExpiresOn", event.target.value)}
                  helper="No passport number is stored."
                />
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="contact-notes">Notes</Label>
                  <p id="contact-notes-help" className="text-xs leading-5 text-muted-foreground">
                    Add dietary preferences, accessibility needs, or planning context. Avoid
                    passport numbers and other sensitive identity documents.
                  </p>
                  <textarea
                    id="contact-notes"
                    name="notes"
                    maxLength={500}
                    rows={3}
                    value={values.notes}
                    onChange={(event) => setField("notes", event.target.value)}
                    placeholder="Vegetarian, prefers aisle seats…"
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
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        )}

        {notice && <p className="text-xs text-muted-foreground">{notice}</p>}

        <DialogFooter>
          {step > 1 && (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => goToStep(step - 1)}
            >
              Back
            </Button>
          )}
          {step < STEPS.length ? (
            <Button type="button" onClick={handleNext}>
              Next
            </Button>
          ) : (
            <Button type="submit" disabled={pending || !allVisited}>
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
          )}
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function StepHeader({
  step,
  onNavigate,
}: {
  step: number;
  onNavigate: (step: number) => void;
}) {
  return (
    <nav aria-label="Contact setup progress" className="mb-2">
      <ol className="flex gap-3 sm:gap-4">
        {STEPS.map((title, index) => {
          const number = index + 1;
          const active = step === number;
          const completed = step > number;
          return (
            <li key={title} className="flex flex-1 flex-col gap-2">
              <button
                type="button"
                onClick={() => onNavigate(number)}
                aria-current={active ? "step" : undefined}
                aria-label={`Go to step: ${title}`}
                className="group flex min-h-11 flex-col gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div
                  className={cn(
                    "h-1.5 rounded-full transition-colors",
                    active ? "bg-primary" : completed ? "bg-primary/40" : "bg-muted group-hover:bg-primary/20"
                  )}
                />
                <span
                  className={cn(
                    "text-xs sm:text-sm font-medium",
                    active ? "text-primary" : completed ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                  )}
                >
                  {title}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
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
  error,
  ...props
}: React.ComponentProps<typeof Input> & {
  label: string;
  name: string;
  helper?: string;
  error?: string;
}) {
  const helperId = helper || error ? `contact-${name}-help` : undefined;
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
      {error ? (
        <p id={helperId} role="alert" className="text-xs leading-5 text-destructive">
          {error}
        </p>
      ) : helper ? (
        <p id={helperId} className="text-xs leading-5 text-muted-foreground">
          {helper}
        </p>
      ) : null}
      <Input
        id={`contact-${name}`}
        name={name}
        aria-describedby={helperId}
        aria-invalid={Boolean(error)}
        {...props}
      />
    </div>
  );
}

function SelectField({
  label,
  name,
  children,
  value,
  onChange,
  required,
  helper,
}: {
  label: string;
  name: string;
  children: React.ReactNode;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
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
        value={value}
        onChange={onChange}
        aria-describedby={helperId}
        className="h-10 w-full rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {children}
      </select>
    </div>
  );
}
