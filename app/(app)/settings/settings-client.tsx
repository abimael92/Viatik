"use client";

import { Check, Copy, KeyRound, LogOut, Pencil, ScanLine, Smartphone, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import QRCode from "react-qr-code";
import { logout, setDiscoverability, updateProfileDetails, type ProfileDetails } from "@/app/actions/auth";
import { viatikQrPayload } from "@/features/contacts/lib/viatik-id";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteDatabase } from "@/lib/db/dexie";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

export function SettingsClient({
  userId,
  phone,
  fullName,
  viatikId,
  discoverable = false,
  profile = null,
}: {
  userId: string;
  phone: string | null;
  fullName: string;
  viatikId?: string | null;
  discoverable?: boolean;
  profile?: ProfileDetails | null;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const saved: ProfileDetails = profile ?? { fullName };

  function addPasskey() {
    startTransition(async () => {
      setMessage(null);
      try {
        const supabase = getSupabaseBrowserClient();
        const { data, error } = await supabase.auth.registerPasskey();
        if (error) throw error;
        if (!data?.id) throw new Error("Passkey registration did not complete.");
        setMessage("Passkey added to your account.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Passkey setup was cancelled.");
      }
    });
  }

  function toggleDiscoverability(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.checked;
    startTransition(async () => {
      setMessage(null);
      const result = await setDiscoverability(next);
      setMessage(result.success ? "Discoverability updated." : result.error);
      router.refresh();
    });
  }

  async function copyViatikId() {
    if (!viatikId) return;
    try {
      await navigator.clipboard.writeText(viatikId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be unavailable; the ID is still visible on screen.
    }
  }

  function signOut() {
    startTransition(async () => {
      const result = await logout();
      if (!result.success) {
        setMessage(result.error);
        return;
      }
      await deleteDatabase(userId);
      router.replace("/login");
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm font-medium text-primary">Account</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Settings</h1>
        <p className="mt-2 text-muted-foreground">Manage your profile, sign-in methods, and session.</p>
      </header>
      {message && <p role="status" className="rounded-lg border bg-card p-3 text-sm">{message}</p>}
      <section className="rounded-2xl border bg-card p-5 sm:p-7" aria-labelledby="profile-heading">
        <div className="flex items-start justify-between gap-3">
          <div className="flex gap-3">
            <UserRound className="size-5 text-primary" />
            <div>
              <h2 id="profile-heading" className="font-semibold">Profile</h2>
              <p className="text-sm text-muted-foreground">How you appear in shared trips. Shown read-only until you edit.</p>
            </div>
          </div>
          {!editing && (
            <Button type="button" variant="outline" onClick={() => setEditing(true)} disabled={pending}>
              <Pencil className="size-4" />Edit
            </Button>
          )}
        </div>

        {editing ? (
          <ProfileEditForm
            initial={saved}
            onCancel={() => setEditing(false)}
            onSaved={(message) => {
              setMessage(message);
              setEditing(false);
              router.refresh();
            }}
          />
        ) : (
          <dl className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">
            <ProfileRow label="Full name" value={saved.fullName} />
            <ProfileRow label="Phone" value={saved.phone} />
            <ProfileRow label="Date of birth" value={saved.birthDate} />
            <ProfileRow label="Preferred currency" value={saved.preferredCurrency} />
            <ProfileRow label="Preferred language" value={saved.preferredLanguage} />
            <ProfileRow label="Dietary restrictions" value={saved.dietaryRestrictions?.join(", ")} />
            <ProfileRow label="Allergies" value={saved.allergies?.join(", ")} />
            <ProfileRow
              label="Emergency contact"
              value={[saved.emergencyContactName, saved.emergencyContactRelationship].filter(Boolean).join(" · ")}
            />
            <ProfileRow label="Emergency phone" value={saved.emergencyContactPhone} />
            <ProfileRow
              label="Passport"
              value={[saved.passportIssuingCountry, saved.passportExpiresOn].filter(Boolean).join(" · ")}
            />
          </dl>
        )}
      </section>
      <section className="rounded-2xl border bg-card p-5 sm:p-7" aria-labelledby="directory-heading">
        <div className="flex gap-3">
          <ScanLine className="size-5 text-primary" />
          <div>
            <h2 id="directory-heading" className="font-semibold">Profile directory</h2>
            <p className="text-sm text-muted-foreground">
              Control who can find and link you by Viatik ID. Only your public name,
              avatar, handle, and preferences are shared — never your email or phone.
            </p>
          </div>
        </div>
        <div className="mt-5 space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-xl border p-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">Discoverable by Viatik ID</p>
              <p className="text-xs text-muted-foreground">
                When on, friends can add you instantly by scanning your profile code or entering your ID.
              </p>
            </div>
            <label className="relative inline-flex shrink-0 cursor-pointer items-center">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={discoverable}
                onChange={toggleDiscoverability}
                disabled={pending || !viatikId}
              />
              <span className="h-6 w-11 rounded-full bg-muted transition-colors peer-checked:bg-primary" />
              <span className="pointer-events-none absolute left-0.5 top-0.5 size-5 rounded-full bg-background shadow transition-transform peer-checked:translate-x-5" />
            </label>
          </div>
          {viatikId && (
            <div className="rounded-xl border p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Your Viatik ID</p>
                  <p className="font-mono text-sm text-muted-foreground">{viatikId}</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => void copyViatikId()} disabled={copied}>
                  {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <div className="mt-4 flex items-center gap-4">
                <div className="rounded-lg border bg-white p-2" aria-hidden>
                  <QRCode value={viatikQrPayload(viatikId)} size={120} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Friends can scan this code to link you instantly. Only your public name,
                  avatar, handle, and preferences are shared.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
      <section className="rounded-2xl border bg-card p-5 sm:p-7" aria-labelledby="security-heading">
        <div className="flex gap-3">
          <KeyRound className="size-5 text-primary" />
          <div>
            <h2 id="security-heading" className="font-semibold">Sign-in and security</h2>
            <p className="text-sm text-muted-foreground">Add a passkey to your verified Supabase account.</p>
          </div>
        </div>
        <div className="mt-5 divide-y rounded-xl border">
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <Smartphone className="size-5 text-muted-foreground" />
            <div className="flex-1">
              <p className="font-medium">SMS authentication</p>
              <p className="text-sm text-muted-foreground">{phone ?? "No phone number available"}</p>
            </div>
            <span className="text-xs font-medium text-success">Verified session</span>
          </div>
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <KeyRound className="size-5 text-muted-foreground" />
            <div className="flex-1">
              <p className="font-medium">Passkeys</p>
              <p className="text-sm text-muted-foreground">Use your device biometrics for a faster sign-in.</p>
            </div>
            <Button variant="outline" onClick={addPasskey} disabled={pending}>Add passkey</Button>
          </div>
        </div>
      </section>
      <section className="rounded-2xl border bg-card p-5 sm:p-7" aria-labelledby="session-heading">
        <h2 id="session-heading" className="font-semibold">Current session</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Signed in as {phone ?? userId}. Signing out removes offline trip data from this device.
        </p>
        <Button className="mt-5" variant="outline" onClick={signOut} disabled={pending}>
          <LogOut className="size-4" />Sign out
        </Button>
      </section>
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value: string | null | undefined }) {
  const display = value?.trim() || "—";
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm text-foreground">{display}</dd>
    </div>
  );
}

function parseTags(value: string): string[] {
  return [...new Set(value.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
}

function ProfileEditForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial: ProfileDetails;
  onCancel: () => void;
  onSaved: (message: string) => void;
}) {
  const [values, setValues] = useState({
    fullName: initial.fullName ?? "",
    phone: initial.phone ?? "",
    birthDate: initial.birthDate ?? "",
    preferredCurrency: initial.preferredCurrency ?? "",
    preferredLanguage: initial.preferredLanguage ?? "",
    dietaryRestrictions: initial.dietaryRestrictions?.join(", ") ?? "",
    allergies: initial.allergies?.join(", ") ?? "",
    emergencyContactName: initial.emergencyContactName ?? "",
    emergencyContactRelationship: initial.emergencyContactRelationship ?? "",
    emergencyContactPhone: initial.emergencyContactPhone ?? "",
    passportIssuingCountry: initial.passportIssuingCountry ?? "",
    passportExpiresOn: initial.passportExpiresOn ?? "",
  });
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function setField(key: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await updateProfileDetails({
        fullName: values.fullName,
        phone: values.phone,
        birthDate: values.birthDate || undefined,
        preferredCurrency: values.preferredCurrency || undefined,
        preferredLanguage: values.preferredLanguage || undefined,
        dietaryRestrictions: parseTags(values.dietaryRestrictions),
        allergies: parseTags(values.allergies),
        emergencyContactName: values.emergencyContactName,
        emergencyContactRelationship: values.emergencyContactRelationship,
        emergencyContactPhone: values.emergencyContactPhone,
        passportIssuingCountry: values.passportIssuingCountry,
        passportExpiresOn: values.passportExpiresOn || undefined,
      });
      if (!result.success) return setMessage(result.error);
      onSaved(result.success ? "Profile saved." : "");
    });
  }

  return (
    <form onSubmit={save} className="mt-5 grid max-w-2xl gap-4 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="settings-fullName">Full name</Label>
        <Input id="settings-fullName" value={values.fullName} onChange={(event) => setField("fullName", event.target.value)} autoComplete="name" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="settings-phone">Phone</Label>
        <Input id="settings-phone" type="tel" inputMode="tel" autoComplete="tel" value={values.phone} onChange={(event) => setField("phone", event.target.value)} placeholder="+1 555 012 3456" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="settings-birthDate">Date of birth</Label>
        <Input id="settings-birthDate" type="date" value={values.birthDate} onChange={(event) => setField("birthDate", event.target.value)} max={new Date().toISOString().slice(0, 10)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="settings-preferredCurrency">Preferred currency</Label>
        <select id="settings-preferredCurrency" value={values.preferredCurrency} onChange={(event) => setField("preferredCurrency", event.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
          <option value="">Not specified</option>
          <option value="USD">USD — US Dollar</option>
          <option value="EUR">EUR — Euro</option>
          <option value="GBP">GBP — British Pound</option>
          <option value="CAD">CAD — Canadian Dollar</option>
          <option value="MXN">MXN — Mexican Peso</option>
          <option value="JPY">JPY — Japanese Yen</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="settings-preferredLanguage">Preferred language</Label>
        <Input id="settings-preferredLanguage" value={values.preferredLanguage} onChange={(event) => setField("preferredLanguage", event.target.value)} placeholder="English" maxLength={35} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="settings-dietaryRestrictions">Dietary restrictions</Label>
        <Input id="settings-dietaryRestrictions" value={values.dietaryRestrictions} onChange={(event) => setField("dietaryRestrictions", event.target.value)} placeholder="vegetarian, gluten-free" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="settings-allergies">Allergies</Label>
        <Input id="settings-allergies" value={values.allergies} onChange={(event) => setField("allergies", event.target.value)} placeholder="nuts, shellfish" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="settings-emergencyContactName">Emergency contact name</Label>
        <Input id="settings-emergencyContactName" value={values.emergencyContactName} onChange={(event) => setField("emergencyContactName", event.target.value)} placeholder="Taylor Rivera" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="settings-emergencyContactRelationship">Emergency relationship</Label>
        <Input id="settings-emergencyContactRelationship" value={values.emergencyContactRelationship} onChange={(event) => setField("emergencyContactRelationship", event.target.value)} placeholder="Parent, partner, friend…" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="settings-emergencyContactPhone">Emergency phone</Label>
        <Input id="settings-emergencyContactPhone" type="tel" inputMode="tel" value={values.emergencyContactPhone} onChange={(event) => setField("emergencyContactPhone", event.target.value)} placeholder="+1 555 012 3456" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="settings-passportIssuingCountry">Passport country</Label>
        <Input id="settings-passportIssuingCountry" value={values.passportIssuingCountry} onChange={(event) => setField("passportIssuingCountry", event.target.value)} placeholder="US" minLength={2} maxLength={2} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="settings-passportExpiresOn">Passport expiration</Label>
        <Input id="settings-passportExpiresOn" type="date" value={values.passportExpiresOn} onChange={(event) => setField("passportExpiresOn", event.target.value)} />
      </div>
      {message && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive sm:col-span-2">{message}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save profile"}</Button>
        <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
