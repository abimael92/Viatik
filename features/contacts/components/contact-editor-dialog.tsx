"use client";

import { localizeThrownError } from "@/lib/i18n/localize-error";

import { CalendarDays, ContactRound, Mail, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { useState } from "react";

import { AvatarPicker, fileToDataUrl, type AvatarChange } from "@/components/ui/avatar-picker";
import { Badge } from "@/components/ui/badge";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserAvatar } from "@/components/ui/user-avatar";
import { AddContactCommandBar } from "@/features/contacts/components/AddContactCommandBar";
import { QRScannerModal } from "@/features/contacts/components/QRScannerModal";
import { contactRepository } from "@/features/contacts/data/dexie-contact-repository";
import type { CurrentPublicProfile } from "@/features/contacts/lib/profile-directory";
import type { Contact, TravelerType, Trip } from "@/features/domain/entities";
import { useI18n } from "@/lib/i18n/i18n-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { cn } from "@/lib/utils";

const STEP_KEYS: TranslationKey[] = ["common.identity", "common.contactDetails", "common.travelDetails"];

function parseTags(value: string): string[] {
  return [...new Set(value.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
}

type ContactFormValues = {
  fullName: string;
  avatarUrl: string | null;
  avatarSeed: string | null;
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
    avatarSeed: contact?.avatarSeed ?? null,
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
  ownProfile,
  relationshipOnly = false,
}: {
  open: boolean;
  userId: string;
  contact?: Contact | null;
  onOpenChange: (open: boolean) => void;
  onSaved?: (contact: Contact) => Promise<void> | void;
  attachToTrip?: boolean;
  ownProfile?: CurrentPublicProfile;
  relationshipOnly?: boolean;
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
          ownProfile={ownProfile}
          relationshipOnly={relationshipOnly}
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
  ownProfile,
  relationshipOnly,
  pending,
  setPending,
}: {
  userId: string;
  contact?: Contact | null;
  attachToTrip?: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (contact: Contact) => Promise<void> | void;
  ownProfile?: CurrentPublicProfile;
  relationshipOnly?: boolean;
  pending: boolean;
  setPending: (pending: boolean) => void;
}) {
  const { t } = useI18n();
  const steps = STEP_KEYS.map((key) => t(key));
  const operation = contact ? "edit" : "create";
  const unified = !contact && !attachToTrip && Boolean(ownProfile);
  const isLinkedToViatik = Boolean(contact?.linkedProfileId);
  const isRelationshipOnly = Boolean(relationshipOnly && isLinkedToViatik);
  const [activeMethod, setActiveMethod] = useState("manual");
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
    ...Array(STEP_KEYS.length - 1).fill(false),
  ]);
  const allVisited = visited.every(Boolean);

  function setField<K extends keyof ContactFormValues>(key: K, value: ContactFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function handleAvatarChange(change: AvatarChange) {
    if (change.file) {
      void fileToDataUrl(change.file).then(
        (url) => {
          setField("avatarUrl", url);
          setField("avatarSeed", null);
        },
        () => setError(t("copy.imageUnreadable"))
      );
      return;
    }
    setField("avatarUrl", change.src);
    setField("avatarSeed", change.seed);
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
    const skipped = steps.slice(0, target - 1).some((_, index) => !visited[index]);
    if (skipped) {
      const firstUnvisited = visited.findIndex((visitedStep) => !visitedStep);
      setNotice(
        firstUnvisited === -1
          ? null
          : `Complete ${steps[firstUnvisited]} before moving on.`
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
      avatarSeed: values.avatarSeed,
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
        setError(localizeThrownError(cause, t, "Unable to check upcoming trips."));
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
        localizeThrownError(
          cause,
          t,
          operation === "edit" ? "copy.unableUpdateContact" : "copy.unableCreateContact"
        )
      );
    } finally {
      setPending(false);
    }
  }

  const manualForm = (
    <form onSubmit={submit} className="space-y-6 px-4 pb-6 pt-5 sm:px-6 sm:pb-6 sm:pt-6">
        <StepHeader step={step} steps={steps} onNavigate={handleStepNavigate} />

        {step === 1 && (
          <div className="space-y-6">
            <div className="flex gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3.5 sm:p-4 text-sm">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
              <div>
                <p className="font-semibold">{t("common.privateByDefault")}</p>
                <p className="mt-1 leading-5 text-muted-foreground">
                  {t("common.privateDetails")}
                </p>
              </div>
            </div>
            <FormSection
              icon={<UserRound className="size-5" />}
              title={t("common.identity")}
              description={t("common.profileHelp")}
            >
              {isLinkedToViatik ? (
                <div className="flex items-center gap-3 sm:gap-4 rounded-xl border border-primary/20 bg-primary/5 p-3.5 sm:p-4">
                  <UserAvatar
                    seed={values.avatarSeed}
                    src={contact?.linkedAvatarUrl ?? values.avatarUrl}
                    name={values.fullName}
                    size="lg"
                    className="size-12 sm:size-16 shrink-0 ring-2 ring-primary/30"
                  />
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <span className="text-sm font-semibold truncate">{values.fullName}</span>
                      <Badge variant="default" className="gap-1 text-[10px] font-semibold py-0.5 px-2">
                        <Sparkles className="size-3" />
                        {contact?.linkedHandle ? `@${contact.linkedHandle}` : t("copy.viatikAccount")}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("copy.profileManaged")}
                    </p>
                  </div>
                </div>
              ) : (
                <AvatarPicker
                  seed={values.avatarSeed}
                  src={values.avatarUrl}
                  name={values.fullName}
                  onChange={handleAvatarChange}
                  uploadHint="Optional · randomize a playful avatar or upload a photo."
                />
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={t("common.fullName")}
                  name="fullName"
                  value={values.fullName}
                  onChange={(event) => setField("fullName", event.target.value)}
                  error={fieldErrors.fullName}
                  placeholder={t("copy.placeholderJordan")}
                  disabled={isLinkedToViatik}
                  helper={
                    isLinkedToViatik
                      ? "Managed by Viatik account · read-only."
                      : "Required · shown to trip collaborators."
                  }
                  required
                  autoFocus={!isLinkedToViatik}
                />
                <SelectField
                  label={t("common.relationship")}
                  name="relationship"
                  value={values.relationship}
                  onChange={(event) =>
                    setField("relationship", event.target.value as Contact["relationship"])
                  }
                  helper={t("copy.relationshipHelper")}
                >
                  <option value="family">{t("copy.family")}</option>
                  <option value="friend">{t("copy.friend")}</option>
                  <option value="coworker">{t("copy.coworker")}</option>
                  <option value="roommate">{t("copy.roommate")}</option>
                  <option value="other">{t("common.other")}</option>
                </SelectField>
                <SelectField
                  label={t("common.travelerType")}
                  name="travelerType"
                  value={values.travelerType}
                  onChange={(event) => setField("travelerType", event.target.value as TravelerType)}
                  helper={t("copy.travelerTypeHelper")}
                >
                  <option value="adult">{t("copy.adult")}</option>
                  <option value="child">{t("copy.child")}</option>
                </SelectField>
              </div>
            </FormSection>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <FormSection
              icon={<Mail className="size-5" />}
              title={t("common.contactDetails")}
              description={t("copy.privateDetailsHelp")}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={t("copy.email")}
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={values.email}
                  onChange={(event) => setField("email", event.target.value)}
                  placeholder={t("copy.placeholderJordanEmail")}
                />
                <Field
                  label={t("common.phone")}
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
              icon={<ShieldCheck className="size-5" />}
              title={t("common.emergencyContact")}
              description={t("copy.emergencyPrivate")}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={t("common.contactName")}
                  name="emergencyContactName"
                  value={values.emergencyContactName}
                  onChange={(event) => setField("emergencyContactName", event.target.value)}
                  placeholder={t("copy.placeholderJane")}
                />
                <Field
                  label={t("copy.relationshipToTraveler")}
                  name="emergencyContactRelationship"
                  value={values.emergencyContactRelationship}
                  onChange={(event) =>
                    setField("emergencyContactRelationship", event.target.value)
                  }
                  placeholder={t("copy.placeholderRelationship")}
                />
                <Field
                  label={t("common.emergencyPhone")}
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
              icon={<CalendarDays className="size-5" />}
              title={t("common.travelDetails")}
              description={t("copy.optionalAgeContextFuture")}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={t("common.dateOfBirth")}
                  name="birthDate"
                  type="date"
                  value={values.birthDate}
                  onChange={(event) => setField("birthDate", event.target.value)}
                  max={new Date().toISOString().slice(0, 10)}
                  helper="Private · useful for age requirements."
                />
                <Field
                  label={t("settings.preferredLanguage")}
                  name="preferredLanguage"
                  value={values.preferredLanguage}
                  onChange={(event) => setField("preferredLanguage", event.target.value)}
                  placeholder={t("settings.languagePlaceholder")}
                  maxLength={35}
                />
                <SelectField
                  label={t("common.preferredCurrency")}
                  name="preferredCurrency"
                  value={values.preferredCurrency}
                  onChange={(event) => setField("preferredCurrency", event.target.value)}
                >
                  <option value="">{t("common.notSpecified")}</option>
                  <option value="USD">{t("copy.usd")}</option>
                  <option value="EUR">{t("copy.eur")}</option>
                  <option value="GBP">{t("copy.gbp")}</option>
                  <option value="CAD">{t("copy.cad")}</option>
                  <option value="MXN">{t("copy.mxn")}</option>
                  <option value="JPY">{t("copy.jpy")}</option>
                </SelectField>
                <Field
                  label={t("common.dietaryRestrictions")}
                  name="dietaryRestrictions"
                  value={values.dietaryRestrictions}
                  onChange={(event) => setField("dietaryRestrictions", event.target.value)}
                  placeholder={t("copy.placeholderDiet")}
                  helper={t("common.separateComma")}
                />
                <Field
                  label={t("common.allergies")}
                  name="allergies"
                  value={values.allergies}
                  onChange={(event) => setField("allergies", event.target.value)}
                  placeholder={t("copy.placeholderAllergies")}
                  helper={t("common.separateComma")}
                />
                <Field
                  label={t("copy.passportIssuingCountry")}
                  name="passportIssuingCountry"
                  value={values.passportIssuingCountry}
                  onChange={(event) => setField("passportIssuingCountry", event.target.value)}
                  placeholder="US"
                  minLength={2}
                  maxLength={2}
                  helper={t("copy.passportCountryHelper")}
                />
                <Field
                  label={t("common.passportExpiration")}
                  name="passportExpiresOn"
                  type="date"
                  value={values.passportExpiresOn}
                  onChange={(event) => setField("passportExpiresOn", event.target.value)}
                  helper={t("copy.noPassportStored")}
                />
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="contact-notes">{t("common.notes")}</Label>
                  <p id="contact-notes-help" className="text-xs leading-5 text-muted-foreground">
                    {t("copy.privateNotesHelp")}
                  </p>
                  <textarea
                    id="contact-notes"
                    name="notes"
                    maxLength={500}
                    rows={3}
                    value={values.notes}
                    onChange={(event) => setField("notes", event.target.value)}
                    placeholder={t("copy.vegetarianNote")}
                    aria-describedby="contact-notes-help"
                    className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              </div>
            </FormSection>
            {upcoming.length > 0 && (
              <fieldset className="space-y-3 rounded-lg border p-3">
                <legend className="px-1 text-sm font-semibold">{t("copy.updateUpcomingTrips")}</legend>
                <label className="flex gap-2 text-sm">
                  <input
                    type="radio"
                    name="propagation"
                    checked={!propagate}
                    onChange={() => setPropagate(false)}
                  />
                  {t("copy.contactOnly")}
                </label>
                <label className="flex gap-2 text-sm">
                  <input
                    type="radio"
                    name="propagation"
                    checked={propagate}
                    onChange={() => setPropagate(true)}
                  />
                  {t("copy.updateTravelerSnapshots")}
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
                      {selected.length === upcoming.length ? t("common.clearAll") : t("common.selectAll")}
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
              {t("common.back")}
            </Button>
          )}
          {step < steps.length ? (
            <Button type="button" onClick={handleNext}>
              {t("common.next")}
            </Button>
          ) : (
            <Button type="submit" variant="primary" disabled={pending || !allVisited}>
              {pending
                ? operation === "edit"
                  ? t("common.updating")
                  : t("common.creating")
                : contact
                  ? t("common.updateContact")
                  : attachToTrip
                    ? t("common.saveAndAdd")
                    : t("common.saveContact")}
            </Button>
          )}
        </DialogFooter>
    </form>
  );

  const relationshipForm = (
    <form onSubmit={submit} className="space-y-6 px-4 pb-6 pt-5 sm:px-6 sm:pb-6 sm:pt-6">
      <div className="space-y-2">
        <Label htmlFor="contact-relationship-only">{t("common.relationship")}</Label>
        <select
          id="contact-relationship-only"
          aria-label={t("common.relationship")}
          value={values.relationship}
          onChange={(event) => setField("relationship", event.target.value as Contact["relationship"])}
          className="h-10 w-full rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <option value="family">{t("copy.family")}</option>
          <option value="friend">{t("copy.friend")}</option>
          <option value="coworker">{t("copy.coworker")}</option>
          <option value="roommate">{t("copy.roommate")}</option>
          <option value="other">{t("common.other")}</option>
        </select>
        <p className="text-xs text-muted-foreground">{t("copy.linkedProfileLocked")}</p>
      </div>
      {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="submit" variant="primary" disabled={pending}>{pending ? t("settings.saving") : "Save relationship"}</Button>
      </DialogFooter>
    </form>
  );

  const header = (
    <DialogHeader className="border-b bg-muted/30 px-4 pb-4 pt-5 sm:px-6 sm:pb-5 sm:pt-6 text-left">
      <div className="flex items-start gap-3">
        <span className="grid size-10 sm:size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <ContactRound className="size-5" />
        </span>
        <div className="space-y-1 sm:space-y-1.5">
          <DialogTitle>
            {contact ? t("copy.editContact") : attachToTrip ? t("common.addSomeoneNew") : t("copy.addContact")}
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            {contact
              ? t("common.contactProfileUpToDate")
              : unified
                ? t("common.chooseAddContact")
                : t("common.reusableProfile")}
          </DialogDescription>
        </div>
      </div>
      {unified && (
        <TabsList className="mt-4">
          <TabsTrigger value="manual">{t("common.manual")}</TabsTrigger>
          <TabsTrigger value="viatik-id">{t("common.viatikId")}</TabsTrigger>
          <TabsTrigger value="scan-qr">{t("common.scanQrTab")}</TabsTrigger>
        </TabsList>
      )}
    </DialogHeader>
  );

  return (
    <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto p-0">
      {isRelationshipOnly ? (
        <>
          {header}
          {relationshipForm}
        </>
      ) : unified && ownProfile ? (
        <Tabs value={activeMethod} onValueChange={setActiveMethod} className="w-full">
          {header}
          <TabsContent
            value="manual"
            forceMount
            className="mt-0 data-[state=inactive]:hidden"
          >
            {manualForm}
          </TabsContent>
          <TabsContent value="viatik-id" className="mt-0 px-4 pb-6 pt-5 sm:px-6 sm:pb-6 sm:pt-6">
            <AddContactCommandBar
              open
              embedded
              userId={userId}
              ownProfile={ownProfile}
              onOpenChange={onOpenChange}
              onOpenScanner={() => setActiveMethod("scan-qr")}
            />
          </TabsContent>
          <TabsContent value="scan-qr" className="mt-0 px-4 pb-6 pt-5 sm:px-6 sm:pb-6 sm:pt-6">
            <QRScannerModal
              open
              embedded
              userId={userId}
              ownProfile={ownProfile}
              onOpenChange={onOpenChange}
            />
          </TabsContent>
        </Tabs>
      ) : (
        <>
          {header}
          {manualForm}
        </>
      )}
    </DialogContent>
  );
}

function StepHeader({
  step,
  steps,
  onNavigate,
}: {
  step: number;
  steps: string[];
  onNavigate: (step: number) => void;
}) {
  const { t } = useI18n();
  return (
    <nav aria-label={t("copy.contactSetupProgress")} className="mb-2">
      <ol className="flex gap-3 sm:gap-4">
        {steps.map((title, index) => {
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
                    "text-xs sm:text-sm font-semibold",
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
