"use client";

import { CalendarDays, Check, Eye, EyeOff, KeyRound, Lock, Mail, Phone, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardEvent, FormEvent, KeyboardEvent, useEffect, useRef, useState, useTransition } from "react";

import {
  developmentLogin,
  loginWithPassword,
  registerWithPassword,
  sendEmailOtp,
  verifyEmailOtp,
} from "@/app/actions/auth";
import { localizeThrownError, localizeUserError } from "@/lib/i18n/localize-error";
import { AvatarPicker, type AvatarChange } from "@/components/ui/avatar-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { cn } from "@/lib/utils";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

// Number of digits in the sign-in OTP. Matches Supabase's email OTP length
// (GOTRUE_MAILER_OTP_LENGTH). Keep the grid-cols-* class in sync with this.
const OTP_LENGTH = 8;

type LoginFormProps = {
  mode?: "login" | "register";
  next?: string;
  initialError?: string;
};

function safeNext(value?: string) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/home";
}

function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  return `${name.slice(0, 2)}${"•".repeat(Math.max(1, name.length - 2))}@${domain}`;
}

function formatCooldown(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function passwordStrength(pw: string, t: ReturnType<typeof useI18n>["t"]) {
  const rules = [
    { label: t("auth.passwordHint"), met: pw.length >= 8 },
    { label: t("copy.uppercaseLetter"), met: /[A-Z]/.test(pw) },
    { label: t("copy.lowercaseLetter"), met: /[a-z]/.test(pw) },
    { label: t("copy.aNumber"), met: /\d/.test(pw) },
    { label: t("copy.aSymbol"), met: /[^A-Za-z0-9]/.test(pw) },
  ];
  const score = rules.filter((rule) => rule.met).length;
  const meta =
    score <= 2
      ? { label: t("copy.weak"), bar: "bg-destructive" }
      : score === 3
        ? { label: t("copy.fair"), bar: "bg-amber-500" }
        : score === 4
          ? { label: t("copy.good"), bar: "bg-lime-500" }
          : { label: t("copy.strong"), bar: "bg-success" };
  return { score, rules, meta };
}

export function LoginForm({ mode = "login", next, initialError }: LoginFormProps) {
  const { t } = useI18n();

  const router = useRouter();
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarSeed, setAvatarSeed] = useState<string | null>(null);
  const strength = passwordStrength(password, t);
  const passwordsMatch = password === confirmPassword;

  function handleAvatarChange(change: AvatarChange) {
    if (change.file) {
      setAvatarFile(change.file);
      setAvatarSeed(null);
      return;
    }
    setAvatarFile(null);
    setAvatarSeed(change.seed);
  }
  const [digits, setDigits] = useState<string[]>(() => Array.from({ length: OTP_LENGTH }, () => ""));
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState<string | null>(initialError ?? null);
  const [success, setSuccess] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  function goHome() {
    router.replace(safeNext(next));
    router.refresh();
  }

  function submitWithPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setSuccess(null);
    startTransition(async () => {
      if (mode === "register") {
        const result = await registerWithPassword(email, password, fullName, phone, birthDate, avatarFile, avatarSeed);
        if (!result.success) return setMessage(localizeUserError(result.error, t, "errors.unexpected"));
        // With email confirmation enabled, a new signup has no session yet.
        if (result.data?.confirmRequired) {
          setRegistered(true);
          return;
        }
      } else {
        const result = await loginWithPassword(email, password);
        if (!result.success) return setMessage(localizeUserError(result.error, t, "errors.unexpected"));
      }
      goHome();
    });
  }

  function requestCode() {
    setMessage(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await sendEmailOtp(email, mode === "register", mode === "register" ? fullName : undefined, mode === "register" ? phone : undefined);
      if (!result.success) {
        setMessage(localizeUserError(result.error, t, "errors.unexpected"));
        if (result.retryAfter) setCooldown(result.retryAfter);
        return;
      }
      setEmail(email.trim().toLowerCase());
      // Development-only: the account was created without sending an email, so
      // verify immediately with the returned magic-link token instead of showing
      // the OTP entry screen.
      if (result.data?.devTokenHash) {
        verifyEmail(result.data.devTokenHash);
        return;
      }
      setSent(true);
      setCooldown(60);
      window.setTimeout(() => refs.current[0]?.focus(), 0);
    });
  }

  function signInWithPasskey() {
    setMessage(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data, error } = await supabase.auth.signInWithPasskey();
        if (error) throw error;
        if (!data.session || !data.user) throw new Error("Passkey sign-in did not create a session.");
        const { data: verified, error: verificationError } = await supabase.auth.getUser();
        if (verificationError || verified.user?.id !== data.user.id) throw new Error("The new session could not be verified.");
        const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", data.user.id).maybeSingle();
        router.replace(profile?.full_name?.trim() ? safeNext(next) : `/onboarding?next=${encodeURIComponent(safeNext(next))}`);
        router.refresh();
      } catch (error) {
        setMessage(localizeThrownError(error, t, "Passkey sign-in was cancelled."));
      }
    });
  }

  function openDevelopmentAccount() {
    setMessage(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await developmentLogin();
      if (!result.success) return setMessage(localizeUserError(result.error, t, "errors.unexpected"));
      router.replace(result.data.onboarded ? safeNext(next) : `/onboarding?next=${encodeURIComponent(safeNext(next))}`);
      router.refresh();
    });
  }

  function verifyEmail(codeOrToken: string) {
    setMessage(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await verifyEmailOtp(email, codeOrToken);
      if (!result.success) return setMessage(localizeUserError(result.error, t, "errors.unexpected"));
      router.replace(
        mode === "register"
          ? safeNext(next)
          : result.data.onboarded
            ? safeNext(next)
            : `/onboarding?next=${encodeURIComponent(safeNext(next))}`
      );
      router.refresh();
    });
  }

  function verifyCode(code = digits.join("")) {
    if (code.length !== OTP_LENGTH) return setMessage(t("errors.completeCode", { count: OTP_LENGTH }));
    verifyEmail(code);
  }

  function updateDigit(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const nextDigits = [...digits];
    nextDigits[index] = digit;
    setDigits(nextDigits);
    if (digit && index < OTP_LENGTH - 1) refs.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !digits[index] && index > 0) refs.current[index - 1]?.focus();
    if (event.key === "ArrowLeft" && index > 0) refs.current[index - 1]?.focus();
    if (event.key === "ArrowRight" && index < OTP_LENGTH - 1) refs.current[index + 1]?.focus();
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const value = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!value) return;
    event.preventDefault();
    const nextDigits = Array.from({ length: OTP_LENGTH }, (_, index) => value[index] ?? "");
    setDigits(nextDigits);
    refs.current[Math.min(value.length, OTP_LENGTH - 1)]?.focus();
  }

  if (registered) {
    return (
      <div className="space-y-6">
        <div>
          <p className="mb-2 text-sm font-semibold text-primary">{t("auth.createAccount")}</p>
          <h1 className="text-3xl font-bold tracking-tight">{t("auth.checkEmail")}</h1>
          <p className="mt-2 text-muted-foreground">{t("auth.confirmationSent", { email: maskEmail(email) })}</p>
        </div>
        <div className="rounded-xl border bg-muted/40 p-4 text-sm text-muted-foreground">
          <p>{t("auth.checkSpam")}</p>
        </div>
        <Link href="/login" className="block text-center text-sm font-semibold text-primary hover:underline">
          {t("auth.backToSignIn")}
        </Link>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="space-y-6">
        <div>
          <p className="mb-2 text-sm font-semibold text-primary">{mode === "register" ? t("auth.createAccount") : t("auth.existingAccount")}</p>
          <h1 className="text-3xl font-bold tracking-tight">{t("auth.checkEmail")}</h1>
          <p className="mt-2 text-muted-foreground">{t("auth.verificationCodeSent", { count: OTP_LENGTH, email: maskEmail(email) })}</p>
        </div>
        <div className="space-y-3">
          <Label id="code-label">{t("auth.verificationCode")}</Label>
          <div role="group" aria-labelledby="code-label" onPaste={handlePaste} className="grid grid-cols-8 gap-1.5 sm:gap-2">
            {digits.map((digit, index) => (
              <Input
                key={index}
                ref={(element) => { refs.current[index] = element; }}
                value={digit}
                onChange={(event) => updateDigit(index, event.target.value)}
                onKeyDown={(event) => handleKeyDown(index, event)}
                onFocus={(event) => event.currentTarget.select()}
                inputMode="numeric"
                autoComplete={index === 0 ? "one-time-code" : "off"}
                aria-label={t("auth.digit", { count: index + 1 })}
                maxLength={1}
                className="h-12 px-0 text-center text-lg font-semibold sm:h-14 sm:text-xl"
                autoFocus={index === 0}
                disabled={pending}
              />
            ))}
          </div>
        </div>
        {message && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{message}</p>}
        <Button variant="primary" className="w-full" size="lg" disabled={pending || digits.some((digit) => !digit)} onClick={() => verifyCode()}>
          {pending ? t("auth.verifying") : t("auth.verifyContinue")}
        </Button>
        <div className="flex flex-col items-center gap-2 text-sm">
          <button type="button" className="font-semibold text-primary disabled:text-muted-foreground" disabled={pending || cooldown > 0} onClick={requestCode}>
            {cooldown ? t("auth.resendIn", { time: formatCooldown(cooldown) }) : t("auth.resend")}
          </button>
          <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => { setSent(false); setDigits(Array.from({ length: OTP_LENGTH }, () => "")); setMessage(null); }}>{t("copy.backToPassword")}</button>
        </div>
      </div>
    );
  }

  return (
    <form className="space-y-6" onSubmit={submitWithPassword}>
      <div>
        <p className="mb-2 text-sm font-semibold text-primary">{mode === "register" ? t("auth.newToViatik") : t("auth.existingAccount")}</p>
        <h1 className="text-3xl font-bold tracking-tight">{mode === "register" ? t("auth.createAccount") : t("auth.signInWelcome")}</h1>
        <p className="mt-2 text-muted-foreground">
          {mode === "register" ? t("auth.registerDescription") : t("auth.loginDescription")}
        </p>
      </div>
      {mode === "register" && (
        <ul className="grid gap-2 rounded-xl bg-muted/60 p-4 text-sm">
          {[t("auth.secureProfile"), t("auth.sharedExpenses"), t("auth.offlineAccess")].map((item) => <li key={item} className="flex items-center gap-2"><Check className="size-5 text-success" />{item}</li>)}
        </ul>
      )}
      {mode === "register" && (
        <AvatarPicker
          seed={avatarSeed}
          src={null}
          name={fullName}
          onChange={handleAvatarChange}
          uploadHint={t("auth.optionalAvatar")}
        />
      )}
      {mode === "register" && (
        <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="fullName">{t("common.displayName")}<span className="text-destructive" aria-hidden="true">*</span></Label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="fullName" name="fullName" type="text" autoComplete="name" placeholder={t("copy.placeholderJohn")} minLength={2} maxLength={60} required autoFocus value={fullName} onChange={(event) => setFullName(event.target.value)} disabled={pending} className="pl-9" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">{t("auth.email")} <span className="text-destructive" aria-hidden="true">*</span></Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="email" name="email" type="email" autoComplete="email" placeholder={t("copy.placeholderEmail")} required value={email} onChange={(event) => setEmail(event.target.value)} disabled={pending} className="pl-9" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">{t("auth.phone")} <span className="text-destructive" aria-hidden="true">*</span></Label>
            <div className="relative">
              <Phone className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+1 555 012 3456" required value={phone} onChange={(event) => setPhone(event.target.value)} disabled={pending} className="pl-9" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="birthDate">{t("common.dateOfBirth")}<span className="text-destructive" aria-hidden="true">*</span></Label>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="birthDate" name="birthDate" type="date" required max={new Date().toISOString().slice(0, 10)} value={birthDate} onChange={(event) => setBirthDate(event.target.value)} disabled={pending} className="pl-9" />
            </div>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="password">{t("auth.password")} <span className="text-destructive" aria-hidden="true">*</span></Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="new-password" placeholder={t("auth.passwordHint")} minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} disabled={pending} className="pl-9 pr-10" />
              <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {password && (
              <>
                <div className="flex items-center gap-2">
                  <div className="flex flex-1 gap-1">
                    {Array.from({ length: 5 }, (_, index) => (
                      <div key={index} className={cn("h-1.5 flex-1 rounded-full", index < strength.score ? strength.meta.bar : "bg-muted")} />
                    ))}
                  </div>
                  <span className="text-xs font-semibold text-muted-foreground">{strength.meta.label}</span>
                </div>
                <ul className="grid gap-1 text-xs sm:grid-cols-2">
                  {strength.rules.map((rule) => (
                    <li key={rule.label} className={cn("flex items-center gap-1.5", rule.met ? "text-success" : "text-muted-foreground")}>
                      <Check className="size-3.5" />{rule.label}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="confirmPassword">{t("auth.confirmPassword")} <span className="text-destructive" aria-hidden="true">*</span></Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="confirmPassword" name="confirmPassword" type={showConfirm ? "text" : "password"} autoComplete="new-password" placeholder={t("auth.repeatPassword")} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} disabled={pending} className="pl-9 pr-10" />
              <button type="button" onClick={() => setShowConfirm((value) => !value)} aria-label={showConfirm ? t("auth.hidePassword") : t("auth.showPassword")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {confirmPassword && !passwordsMatch && <p className="text-xs text-destructive">{t("auth.mismatch")}</p>}
          </div>
        </div>
      )}
      {mode === "login" && (
        <div className="grid gap-y-5">
          <div className="space-y-2">
            <Label htmlFor="email">{t("auth.email")}</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="email" name="email" type="email" autoComplete="email" placeholder={t("copy.placeholderEmail")} required autoFocus value={email} onChange={(event) => setEmail(event.target.value)} disabled={pending} className="pl-9" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t("auth.password")}</Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder={t("auth.yourPassword")} required value={password} onChange={(event) => setPassword(event.target.value)} disabled={pending} className="pl-9 pr-10" />
              <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
        </div>
      )}
      {message && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{message}</p>}
      {success && <p role="status" className="rounded-lg bg-success/10 p-3 text-sm text-success">{success}</p>}
      <Button type="submit" variant="primary" className="w-full" size="lg" disabled={pending || !email || !password || (mode === "register" && (!fullName || !phone || !birthDate || !passwordsMatch || strength.score < 4))}>
        {pending ? t("auth.pleaseWait") : mode === "register" ? t("auth.createAccount") : t("auth.signIn")}
      </Button>
      <div className="text-center">
        <button type="button" className="text-sm font-semibold text-primary hover:underline disabled:text-muted-foreground" disabled={pending} onClick={requestCode}>
          {t("auth.useCode")}
        </button>
        <p className="mt-1 text-xs text-muted-foreground">
          {mode === "register" ? t("auth.confirmationNote") : t("auth.codeNote")}
        </p>
      </div>
      {mode === "login" && (
        <div className="space-y-3 border-t pt-5">
          <Button type="button" variant="outline" className="w-full" size="lg" disabled={pending} onClick={signInWithPasskey}>
            <KeyRound className="size-5" />{t("auth.passkey")}
          </Button>
          <p className="text-center text-xs text-muted-foreground">{t("auth.passkeyNote")}</p>
        </div>
      )}
      {mode === "login" && process.env.NODE_ENV === "development" && (
        <div className="border-t pt-5">
          <Button type="button" variant="outline" className="w-full" disabled={pending} onClick={openDevelopmentAccount}>{t("auth.developmentAccount")}</Button>
          <p className="mt-2 text-center text-xs text-muted-foreground">{t("auth.localOnly")}</p>
        </div>
      )}
      <p className="text-center text-sm">
        {mode === "register" ? `${t("auth.alreadyHaveAccount")} ` : `${t("auth.newToViatikQuestion")} `}
        <Link className="font-semibold text-primary hover:underline" href={mode === "register" ? "/login" : "/register"}>
          {mode === "register" ? t("auth.signIn") : t("auth.createAnAccount")}
        </Link>
      </p>
    </form>
  );
}
