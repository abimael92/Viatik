"use client";

import { CalendarDays, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { completeOnboarding, type OnboardingDetails } from "@/app/actions/auth";
import { AvatarPicker, type AvatarChange } from "@/components/ui/avatar-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const STEPS = ["Identity", "Contact details", "Travel details"];

function parseTags(value: string): string[] {
  return [...new Set(value.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
}

type FormValues = {
  fullName: string;
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
};

const emptyValues: FormValues = {
  fullName: "",
  phone: "",
  emergencyContactName: "",
  emergencyContactRelationship: "",
  emergencyContactPhone: "",
  birthDate: "",
  preferredLanguage: "",
  preferredCurrency: "",
  dietaryRestrictions: "",
  allergies: "",
  passportIssuingCountry: "",
  passportExpiresOn: "",
};

export function OnboardingForm({ email, next }: { email: string; next: string }) {
  const router = useRouter();
  const [avatar, setAvatar] = useState<File | null>(null);
  const [step, setStep] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [values, setValues] = useState<FormValues>(emptyValues);
  const [pending, startTransition] = useTransition();
  const [visited, setVisited] = useState<boolean[]>([true, ...Array(STEPS.length - 1).fill(false)]);
  const allVisited = visited.every(Boolean);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  function setField<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function handleAvatarChange(change: AvatarChange) {
    if (change.file) {
      setAvatar(change.file);
      setAvatarUrl(null);
      return;
    }
    setAvatar(null);
    setAvatarUrl(change.value);
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
      else if (name.length > 60) errors.fullName = "Use no more than 60 characters.";
    }
    return errors;
  }

  function focusFirstError(errors: Record<string, string>) {
    for (const key of Object.keys(errors)) {
      const element = document.getElementById(`onboarding-${key}`);
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

  function handleStepNavigate(target: number) {
    if (target === step) return;
    if (target < step) {
      goToStep(target);
      return;
    }
    const skipped = STEPS.slice(0, target - 1).some((_, index) => !visited[index]);
    if (skipped) {
      const firstUnvisited = visited.findIndex((visitedStep) => !visitedStep);
      setNotice(
        firstUnvisited === -1 ? null : `Complete ${STEPS[firstUnvisited]} before moving on.`
      );
      return;
    }
    goToStep(target);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (values.fullName.trim().length < 2) {
      const errors = { fullName: "Enter a display name with at least 2 characters." };
      setFieldErrors(errors);
      focusFirstError(errors);
      return;
    }
    const details: OnboardingDetails = {
      avatarUrl: avatarUrl ?? undefined,
      phone: values.phone,
      birthDate: values.birthDate || undefined,
      emergencyContactName: values.emergencyContactName,
      emergencyContactRelationship: values.emergencyContactRelationship,
      emergencyContactPhone: values.emergencyContactPhone,
      dietaryRestrictions: parseTags(values.dietaryRestrictions),
      allergies: parseTags(values.allergies),
      passportIssuingCountry: values.passportIssuingCountry,
      passportExpiresOn: values.passportExpiresOn || undefined,
      preferredCurrency: values.preferredCurrency || undefined,
      preferredLanguage: values.preferredLanguage || undefined,
    };
    setMessage(null);
    startTransition(async () => {
      const result = await completeOnboarding(values.fullName.trim(), avatar, details);
      if (!result.success) return setMessage(result.error);
      router.replace(next);
      router.refresh();
    });
  }

  return (
    <form className="space-y-6" onSubmit={submit}>
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">One last step</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Make Viatik yours</h1>
        <p className="mt-2 text-muted-foreground">
          Only your name is required — the rest is optional and stays private to you.
        </p>
      </div>

      <StepHeader step={step} onNavigate={handleStepNavigate} />

      {step === 1 && (
        <div className="space-y-6">
          <AvatarPicker
            value={avatarUrl}
            name={values.fullName}
            onChange={handleAvatarChange}
            uploadHint="Optional · pick a preset or upload a photo (up to 2 MB)."
          />
          <Field
            label="Display name"
            name="fullName"
            value={values.fullName}
            onChange={(event) => setField("fullName", event.target.value)}
            error={fieldErrors.fullName}
            autoComplete="name"
            placeholder="Alex Morgan"
            required
            autoFocus
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
            helper="Optional · used for account recovery and shared trip details."
          />
        </div>
      )}

      {step === 2 && (
        <section className="space-y-4 rounded-xl border border-border/70 bg-card p-4 sm:p-5">
          <div className="flex items-start gap-3 border-b border-border/60 pb-4">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
              <ShieldCheck className="size-4" />
            </span>
            <div>
              <h3 className="text-sm font-semibold">Emergency contact</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Private safety details for the person to contact during an emergency. All optional.
              </p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Contact name" name="emergencyContactName" value={values.emergencyContactName} onChange={(event) => setField("emergencyContactName", event.target.value)} placeholder="Taylor Rivera" />
            <Field label="Relationship" name="emergencyContactRelationship" value={values.emergencyContactRelationship} onChange={(event) => setField("emergencyContactRelationship", event.target.value)} placeholder="Parent, partner, friend…" />
            <Field label="Emergency phone" name="emergencyContactPhone" type="tel" inputMode="tel" value={values.emergencyContactPhone} onChange={(event) => setField("emergencyContactPhone", event.target.value)} placeholder="+1 555 012 3456" />
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="space-y-4 rounded-xl border border-border/70 bg-card p-4 sm:p-5">
          <div className="flex items-start gap-3 border-b border-border/60 pb-4">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
              <CalendarDays className="size-4" />
            </span>
            <div>
              <h3 className="text-sm font-semibold">Travel details</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Optional context for planning age-aware activities and shared trips.
              </p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date of birth" name="birthDate" type="date" value={values.birthDate} onChange={(event) => setField("birthDate", event.target.value)} max={new Date().toISOString().slice(0, 10)} />
            <Field label="Preferred language" name="preferredLanguage" value={values.preferredLanguage} onChange={(event) => setField("preferredLanguage", event.target.value)} placeholder="English" maxLength={35} />
            <SelectField label="Preferred currency" name="preferredCurrency" value={values.preferredCurrency} onChange={(event) => setField("preferredCurrency", event.target.value)}>
              <option value="">Not specified</option>
              <option value="USD">USD — US Dollar</option>
              <option value="EUR">EUR — Euro</option>
              <option value="GBP">GBP — British Pound</option>
              <option value="CAD">CAD — Canadian Dollar</option>
              <option value="MXN">MXN — Mexican Peso</option>
              <option value="JPY">JPY — Japanese Yen</option>
            </SelectField>
            <Field label="Dietary restrictions" name="dietaryRestrictions" value={values.dietaryRestrictions} onChange={(event) => setField("dietaryRestrictions", event.target.value)} placeholder="vegetarian, gluten-free" helper="Separate multiple items with commas." />
            <Field label="Allergies" name="allergies" value={values.allergies} onChange={(event) => setField("allergies", event.target.value)} placeholder="nuts, shellfish" helper="Separate multiple items with commas." />
            <Field label="Passport issuing country" name="passportIssuingCountry" value={values.passportIssuingCountry} onChange={(event) => setField("passportIssuingCountry", event.target.value)} placeholder="US" minLength={2} maxLength={2} helper="Two-letter country code only." />
            <Field label="Passport expiration" name="passportExpiresOn" type="date" value={values.passportExpiresOn} onChange={(event) => setField("passportExpiresOn", event.target.value)} helper="No passport number is stored." />
          </div>
        </section>
      )}

      {message && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{message}</p>}
      {notice && <p className="text-xs text-muted-foreground">{notice}</p>}

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Signed in as {email}</p>
        <div className="flex items-center gap-2">
          {step > 1 && (
            <Button type="button" variant="outline" disabled={pending} onClick={() => goToStep(step - 1)}>
              Back
            </Button>
          )}
          {step < STEPS.length ? (
            <Button type="button" onClick={handleNext}>Next</Button>
          ) : (
            <Button type="submit" disabled={pending || !allVisited}>
              {pending ? "Saving your profile…" : "Continue to Viatik"}
            </Button>
          )}
        </div>
      </div>
    </form>
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
    <nav aria-label="Profile setup progress" className="mb-2">
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
                <div className={cn("h-1.5 rounded-full transition-colors", active ? "bg-primary" : completed ? "bg-primary/40" : "bg-muted group-hover:bg-primary/20")} />
                <span className={cn("text-xs sm:text-sm font-medium", active ? "text-primary" : completed ? "text-foreground" : "text-muted-foreground group-hover:text-foreground")}>
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
  const helperId = helper || error ? `onboarding-${name}-help` : undefined;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-0.5">
        <Label htmlFor={`onboarding-${name}`}>{label}</Label>
        {props.required && <span className="text-destructive" aria-hidden="true">*</span>}
      </div>
      {error ? (
        <p id={helperId} role="alert" className="text-xs leading-5 text-destructive">{error}</p>
      ) : helper ? (
        <p id={helperId} className="text-xs leading-5 text-muted-foreground">{helper}</p>
      ) : null}
      <Input id={`onboarding-${name}`} name={name} aria-describedby={helperId} aria-invalid={Boolean(error)} {...props} />
    </div>
  );
}

function SelectField({
  label,
  name,
  children,
  value,
  onChange,
}: {
  label: string;
  name: string;
  children: React.ReactNode;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={`onboarding-${name}`}>{label}</Label>
      <select
        id={`onboarding-${name}`}
        name={name}
        value={value}
        onChange={onChange}
        className="h-10 w-full rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-0"
      >
        {children}
      </select>
    </div>
  );
}
