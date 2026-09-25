"use client";

import { localizeThrownError, localizeUserError } from "@/lib/i18n/localize-error";

import { Check, Copy, KeyRound, Pencil, ScanLine, Smartphone, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import QRCode from "react-qr-code";
import { getConnectionQrPayload } from "@/app/actions/connections";
import { updateProfileDetails, type ProfileDetails } from "@/app/actions/auth";
import { PROFILE_UPDATED_EVENT } from "@/features/profile/lib/use-local-profile";
import { AvatarPicker, type AvatarChange } from "@/components/ui/avatar-picker";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { useI18n } from "@/lib/i18n/i18n-provider";

export function SettingsClient({
  phone,
  fullName,
  viatikId,
  profile = null,
}: {
  phone: string | null;
  fullName: string;
  viatikId?: string | null;
  profile?: ProfileDetails | null;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [qrState, setQrState] = useState<{ id: string; value: string | null; error: string | null } | null>(null);
  const saved: ProfileDetails = profile ?? { fullName };
  const qrValue = qrState && qrState.id === viatikId ? qrState.value : null;
  const qrError = qrState && qrState.id === viatikId ? qrState.error : null;

  useEffect(() => {
    let cancelled = false;
    if (!viatikId) return () => { cancelled = true; };

    void getConnectionQrPayload().then((payload) => {
      if (cancelled) return;
      setQrState(payload.success
        ? { id: viatikId, value: payload.qrValue, error: null }
        : { id: viatikId, value: null, error: payload.error });
    });

    return () => {
      cancelled = true;
    };
  }, [viatikId]);

  function addPasskey() {
    startTransition(async () => {
      setMessage(null);
      try {
        const supabase = getSupabaseBrowserClient();
        const { data, error } = await supabase.auth.registerPasskey();
        if (error) throw error;
        if (!data?.id) throw new Error("Passkey registration did not complete.");
        setMessage(t("common.passkeyAdded"));
      } catch (error) {
        setMessage(localizeThrownError(error, t, "common.passkeyCancelled"));
      }
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

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold text-primary">{t("common.account")}</p>
        <Heading level={1} className="mt-1 text-3xl font-bold">{t("common.settings")}</Heading>
        <p className="mt-2 text-muted-foreground">{t("common.manageAccount")}</p>
      </header>
      {message && <p role="status" className="rounded-lg border bg-card p-3 text-sm">{message}</p>}
      <Tabs defaultValue="profile" className="w-full">
        <TabsList>
          <TabsTrigger value="profile"><UserRound className="size-5" />{t("common.profile")}</TabsTrigger>
          <TabsTrigger value="directory"><ScanLine className="size-5" />{t("common.directory")}</TabsTrigger>
          <TabsTrigger value="security"><KeyRound className="size-5" />{t("common.security")}</TabsTrigger>
        </TabsList>
        <TabsContent value="profile">
          <section className="rounded-2xl border bg-card p-5 sm:p-7" aria-labelledby="profile-heading">
            <div className="flex items-start justify-between gap-3">
              <div className="flex gap-3">
                <UserRound className="size-5 text-primary" />
                <div>
                  <h2 id="profile-heading" className="font-semibold">{t("common.profile")}</h2>
                  <p className="text-sm text-muted-foreground">{t("common.profileHelp")}</p>
                </div>
              </div>
              {!editing && (
                <Button type="button" variant="outline" className="border-yellow-300 bg-yellow-50 text-yellow-700 hover:bg-yellow-100" onClick={() => setEditing(true)} disabled={pending}>
                  <Pencil className="size-5" />{t("common.edit")}
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
              <>
                <div className="mt-5 flex items-center gap-4">
                  <UserAvatar
                    seed={saved.avatarSeed}
                    src={saved.avatarUrl}
                    name={saved.fullName}
                    size="lg"
                  />
                  <div>
                    <p className="font-semibold">{saved.fullName}</p>
                    <p className="text-sm text-muted-foreground">{saved.phone ?? t("common.noPhone")}</p>
                  </div>
                </div>
                <dl className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">
                  <ProfileRow label={t("common.fullName")} value={saved.fullName} />
                  <ProfileRow label={t("common.phone")} value={saved.phone} />
                  <ProfileRow label={t("common.dateOfBirth")} value={saved.birthDate} />
                  <ProfileRow label={t("common.preferredCurrency")} value={saved.preferredCurrency} />
                  <ProfileRow label={t("common.preferredLanguage")} value={saved.preferredLanguage} />
                  <ProfileRow label={t("common.dietaryRestrictions")} value={saved.dietaryRestrictions?.join(", ")} />
                  <ProfileRow label={t("common.allergies")} value={saved.allergies?.join(", ")} />
                  <ProfileRow
                    label={t("common.emergencyContact")}
                    value={[saved.emergencyContactName, saved.emergencyContactRelationship].filter(Boolean).join(" · ")}
                  />
                  <ProfileRow label={t("common.emergencyPhone")} value={saved.emergencyContactPhone} />
                  <ProfileRow
                    label={t("common.passport")}
                    value={[saved.passportIssuingCountry, saved.passportExpiresOn].filter(Boolean).join(" · ")}
                  />
                </dl>
              </>
            )}
          </section>
        </TabsContent>
        <TabsContent value="directory">
          <section className="overflow-hidden rounded-2xl border bg-card" aria-labelledby="directory-heading">
            <div className="border-b bg-muted/20 px-5 py-5 sm:px-7">
              <div className="flex items-start gap-3">
                <ScanLine className="mt-0.5 size-5 shrink-0 text-primary" />
                <div className="min-w-0">
                  <h2 id="directory-heading" className="font-semibold">{t("common.profileDirectory")}</h2>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                    {t("common.directoryDescription")}
                  </p>
                </div>
              </div>
            </div>
            {viatikId && (
              <div className="mx-auto grid max-w-3xl items-center gap-8 px-5 py-8 sm:px-8 md:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)] md:gap-12">
                <div className="flex justify-center">
                  {qrValue ? (
                    <div className="rounded-3xl border bg-white p-5 shadow-sm" aria-hidden>
                      <QRCode value={qrValue} size={200} />
                    </div>
                  ) : qrError ? (
                    <p role="alert" className="max-w-xs rounded-lg bg-destructive/10 p-3 text-center text-sm text-destructive">{qrError}</p>
                  ) : (
                    <div className="grid size-60 place-items-center rounded-3xl border bg-muted/40 text-sm text-muted-foreground" role="status">{t("copy.preparingQr")}</div>
                  )}
                </div>
                <div className="flex flex-col items-center text-center md:items-start md:text-left">
                  <p className="text-sm font-semibold">{t("common.yourViatikId")}</p>
                  <p className="mt-1 break-all font-mono text-sm text-muted-foreground">{viatikId}</p>
                  <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => void copyViatikId()} disabled={copied}>
                    {copied ? <Check className="size-5 text-success" /> : <Copy className="size-5" />}
                    {copied ? t("common.copied") : t("common.copy")}
                  </Button>
                  <div className="mt-6 border-t pt-5 text-sm leading-6 text-muted-foreground md:w-full">
                    <p>{t("common.scanToLink")}</p>
                    <p>{t("common.publicProfileShared")}</p>
                  </div>
                </div>
              </div>
            )}
          </section>
        </TabsContent>
        <TabsContent value="security">
          <section className="rounded-2xl border bg-card p-5 sm:p-7" aria-labelledby="security-heading">
            <div className="flex gap-3">
              <KeyRound className="size-5 text-primary" />
              <div>
                <h2 id="security-heading" className="font-semibold">{t("common.signInSecurity")}</h2>
                <p className="text-sm text-muted-foreground">{t("copy.addPasskeyHelp")}</p>
              </div>
            </div>
            <div className="mt-5 divide-y rounded-xl border">
              <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <Smartphone className="size-5 text-muted-foreground" />
                <div className="flex-1">
                  <p className="font-semibold">{t("common.smsAuthentication")}</p>
                  <p className="text-sm text-muted-foreground">{phone ?? t("common.noPhoneAvailable")}</p>
                </div>
                <span className="text-xs font-semibold text-success">{t("common.verifiedSession")}</span>
              </div>
              <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <KeyRound className="size-5 text-muted-foreground" />
                <div className="flex-1">
                  <p className="font-semibold">{t("common.passkeys")}</p>
                  <p className="text-sm text-muted-foreground">{t("copy.passkeyBiometrics")}</p>
                </div>
                <Button variant="outline" onClick={addPasskey} disabled={pending}>{t("common.addPasskey")}</Button>
              </div>
            </div>
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value: string | null | undefined }) {
  const display = value?.trim() || "—";
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
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
  const { t } = useI18n();
  const [values, setValues] = useState({
    fullName: initial.fullName ?? "",
    phone: initial.phone ?? "",
    birthDate: initial.birthDate ?? "",
    preferredCurrency: initial.preferredCurrency ?? "",
    preferredLanguage: initial.preferredLanguage ?? "",
    muteTripNotifications: initial.muteTripNotifications ?? false,
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
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initial.avatarUrl ?? null);
  const [avatarSeed, setAvatarSeed] = useState<string | null>(initial.avatarSeed ?? null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  function setField(key: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function handleAvatarChange(change: AvatarChange) {
    if (change.file) {
      setAvatarFile(change.file);
      setAvatarSeed(null);
      setAvatarUrl(null);
      return;
    }
    setAvatarFile(null);
    setAvatarSeed(change.seed);
    setAvatarUrl(null);
  }

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await updateProfileDetails(
        {
          fullName: values.fullName,
          avatarUrl: avatarUrl ?? undefined,
          avatarSeed: avatarSeed ?? undefined,
          phone: values.phone,
        birthDate: values.birthDate || undefined,
        preferredCurrency: values.preferredCurrency || undefined,
        preferredLanguage: values.preferredLanguage || undefined,
        muteTripNotifications: values.muteTripNotifications,
        dietaryRestrictions: parseTags(values.dietaryRestrictions),
        allergies: parseTags(values.allergies),
        emergencyContactName: values.emergencyContactName,
        emergencyContactRelationship: values.emergencyContactRelationship,
        emergencyContactPhone: values.emergencyContactPhone,
          passportIssuingCountry: values.passportIssuingCountry,
          passportExpiresOn: values.passportExpiresOn || undefined,
        },
        avatarFile
      );
      if (!result.success) return setMessage(localizeUserError(result.error, t, "errors.profileSaveFailed"));
      window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
      onSaved(result.success ? "Profile saved." : "");
    });
  }

  return (
    <form onSubmit={save} className="mt-5 grid max-w-2xl gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <AvatarPicker
          seed={avatarSeed}
          src={avatarUrl}
          name={values.fullName}
          onChange={handleAvatarChange}
          uploadHint="Optional · randomize a playful avatar or upload a photo."
        />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="settings-fullName">{t("common.fullName")}</Label>
        <Input id="settings-fullName" value={values.fullName} onChange={(event) => setField("fullName", event.target.value)} autoComplete="name" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="settings-phone">{t("common.phone")}</Label>
        <Input id="settings-phone" type="tel" inputMode="tel" autoComplete="tel" value={values.phone} onChange={(event) => setField("phone", event.target.value)} placeholder="+1 555 012 3456" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="settings-birthDate">{t("common.dateOfBirth")}</Label>
        <Input id="settings-birthDate" type="date" value={values.birthDate} onChange={(event) => setField("birthDate", event.target.value)} max={new Date().toISOString().slice(0, 10)} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="settings-preferredCurrency">{t("common.preferredCurrency")}</Label>
        <select id="settings-preferredCurrency" value={values.preferredCurrency} onChange={(event) => setField("preferredCurrency", event.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
          <option value="">{t("common.notSpecified")}</option>
          <option value="USD">{t("copy.usd")}</option>
          <option value="EUR">{t("copy.eur")}</option>
          <option value="GBP">{t("copy.gbp")}</option>
          <option value="CAD">{t("copy.cad")}</option>
          <option value="MXN">{t("copy.mxn")}</option>
          <option value="JPY">{t("copy.jpy")}</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="settings-preferredLanguage">{t("common.preferredLanguage")}</Label>
        <Input id="settings-preferredLanguage" value={values.preferredLanguage} onChange={(event) => setField("preferredLanguage", event.target.value)} placeholder={t("common.english")} maxLength={35} />
      </div>
      <label className="flex items-center gap-3 rounded-xl border p-3 text-sm sm:col-span-2">
        <input type="checkbox" checked={values.muteTripNotifications} onChange={(event) => setValues((current) => ({ ...current, muteTripNotifications: event.target.checked }))} />
        <span><span className="block font-semibold">{t("copy.muteTripNotifications")}</span><span className="text-xs text-muted-foreground">10 PM – 8 AM</span></span>
      </label>
      <div className="space-y-2">
        <Label htmlFor="settings-dietaryRestrictions">{t("common.dietaryRestrictions")}</Label>
        <Input id="settings-dietaryRestrictions" value={values.dietaryRestrictions} onChange={(event) => setField("dietaryRestrictions", event.target.value)} placeholder={t("copy.placeholderDiet")} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="settings-allergies">{t("common.allergies")}</Label>
        <Input id="settings-allergies" value={values.allergies} onChange={(event) => setField("allergies", event.target.value)} placeholder={t("copy.placeholderAllergies")} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="settings-emergencyContactName">{t("common.emergencyContactName")}</Label>
        <Input id="settings-emergencyContactName" value={values.emergencyContactName} onChange={(event) => setField("emergencyContactName", event.target.value)} placeholder={t("copy.placeholderJane")} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="settings-emergencyContactRelationship">{t("common.emergencyRelationship")}</Label>
        <Input id="settings-emergencyContactRelationship" value={values.emergencyContactRelationship} onChange={(event) => setField("emergencyContactRelationship", event.target.value)} placeholder={t("copy.placeholderRelationship")} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="settings-emergencyContactPhone">{t("common.emergencyPhone")}</Label>
        <Input id="settings-emergencyContactPhone" type="tel" inputMode="tel" value={values.emergencyContactPhone} onChange={(event) => setField("emergencyContactPhone", event.target.value)} placeholder="+1 555 012 3456" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="settings-passportIssuingCountry">{t("common.passportCountry")}</Label>
        <Input id="settings-passportIssuingCountry" value={values.passportIssuingCountry} onChange={(event) => setField("passportIssuingCountry", event.target.value)} placeholder="US" minLength={2} maxLength={2} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="settings-passportExpiresOn">{t("common.passportExpiration")}</Label>
        <Input id="settings-passportExpiresOn" type="date" value={values.passportExpiresOn} onChange={(event) => setField("passportExpiresOn", event.target.value)} />
      </div>
      {message && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive sm:col-span-2">{message}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" variant="primary" disabled={pending}>{pending ? "Saving…" : "Save profile"}</Button>
        <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>{t("common.cancel")}</Button>
      </div>
    </form>
  );
}
