"use client";

import { Check, KeyRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardEvent, KeyboardEvent, useEffect, useRef, useState, useTransition } from "react";

import { developmentLogin, sendEmailOtp, verifyEmailOtp } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

type LoginFormProps = {
  mode?: "login" | "register";
  next?: string;
};

function safeNext(value?: string) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/trips";
}

function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  return `${name.slice(0, 2)}${"•".repeat(Math.max(1, name.length - 2))}@${domain}`;
}

export function LoginForm({ mode = "login", next }: LoginFormProps) {
  const router = useRouter();
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  function requestCode() {
    setMessage(null);
    startTransition(async () => {
      const result = await sendEmailOtp(email, mode === "register", mode === "register" ? fullName : undefined);
      if (!result.success) {
        setMessage(result.error);
        if (result.retryAfter) setCooldown(result.retryAfter);
        return;
      }
      setEmail(email.trim().toLowerCase());
      setSent(true);
      setCooldown(60);
      window.setTimeout(() => refs.current[0]?.focus(), 0);
    });
  }

  function signInWithPasskey() {
    setMessage(null);
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
        setMessage(error instanceof Error ? error.message : "Passkey sign-in was cancelled.");
      }
    });
  }

  function openDevelopmentAccount() {
    setMessage(null);
    startTransition(async () => {
      const result = await developmentLogin();
      if (!result.success) return setMessage(result.error);
      router.replace(result.data.onboarded ? safeNext(next) : `/onboarding?next=${encodeURIComponent(safeNext(next))}`);
      router.refresh();
    });
  }

  function verifyCode(code = digits.join("")) {
    if (code.length !== 6) return setMessage("Enter the complete 6-digit code.");
    setMessage(null);
    startTransition(async () => {
      const result = await verifyEmailOtp(email, code);
      if (!result.success) return setMessage(result.error);
      router.replace(result.data.onboarded ? safeNext(next) : `/onboarding?next=${encodeURIComponent(safeNext(next))}`);
      router.refresh();
    });
  }

  function updateDigit(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const nextDigits = [...digits];
    nextDigits[index] = digit;
    setDigits(nextDigits);
    if (digit && index < 5) refs.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !digits[index] && index > 0) refs.current[index - 1]?.focus();
    if (event.key === "ArrowLeft" && index > 0) refs.current[index - 1]?.focus();
    if (event.key === "ArrowRight" && index < 5) refs.current[index + 1]?.focus();
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const value = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!value) return;
    event.preventDefault();
    const nextDigits = Array.from({ length: 6 }, (_, index) => value[index] ?? "");
    setDigits(nextDigits);
    refs.current[Math.min(value.length, 5)]?.focus();
  }

  if (sent) {
    return (
      <div className="space-y-6">
        <div>
          <p className="mb-2 text-sm font-semibold text-primary">{mode === "register" ? "Create your account" : "Sign in to your account"}</p>
          <h1 className="text-3xl font-bold tracking-tight">Check your email</h1>
          <p className="mt-2 text-muted-foreground">Enter the 6-digit code sent to {maskEmail(email)}.</p>
        </div>
        <div className="space-y-3">
          <Label id="code-label">Verification code</Label>
          <div role="group" aria-labelledby="code-label" onPaste={handlePaste} className="grid grid-cols-6 gap-2">
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
                aria-label={`Digit ${index + 1}`}
                maxLength={1}
                className="h-12 px-0 text-center text-lg font-semibold sm:h-14 sm:text-xl"
                autoFocus={index === 0}
                disabled={pending}
              />
            ))}
          </div>
        </div>
        {message && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{message}</p>}
        <Button className="w-full" size="lg" disabled={pending || digits.some((digit) => !digit)} onClick={() => verifyCode()}>
          {pending ? "Verifying…" : "Verify and continue"}
        </Button>
        <div className="flex flex-col items-center gap-2 text-sm">
          <button type="button" className="font-medium text-primary disabled:text-muted-foreground" disabled={pending || cooldown > 0} onClick={requestCode}>
            {cooldown ? `Resend code in ${cooldown}s` : "Resend code"}
          </button>
          <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => { setSent(false); setDigits(["", "", "", "", "", ""]); setMessage(null); }}>
            Use a different email
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="space-y-6" onSubmit={(event) => { event.preventDefault(); requestCode(); }}>
      <div>
        <p className="mb-2 text-sm font-semibold text-primary">{mode === "register" ? "New to Viatik" : "Existing account"}</p>
        <h1 className="text-3xl font-bold tracking-tight">{mode === "register" ? "Create your account" : "Welcome back"}</h1>
        <p className="mt-2 text-muted-foreground">
          {mode === "register" ? "Sign up to create trips, invite friends, and keep every plan in one place." : "Sign in with the email already connected to your Viatik account."}
        </p>
      </div>
      {mode === "register" && (
        <ul className="grid gap-2 rounded-xl bg-muted/60 p-4 text-sm">
          {["Your profile and trips saved securely", "Shared itineraries and expenses", "Offline access while you travel"].map((item) => <li key={item} className="flex items-center gap-2"><Check className="size-4 text-success" />{item}</li>)}
        </ul>
      )}
      {mode === "register" && (
        <div className="space-y-2">
          <Label htmlFor="fullName">Display name</Label>
          <Input id="fullName" name="fullName" type="text" autoComplete="name" placeholder="Aby Garcia" minLength={2} maxLength={60} required autoFocus value={fullName} onChange={(event) => setFullName(event.target.value)} disabled={pending} />
          <p className="text-xs text-muted-foreground">This is how friends will recognize you in shared trips.</p>
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="email">Email address</Label>
        <Input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required autoFocus={mode === "login"} value={email} onChange={(event) => setEmail(event.target.value)} disabled={pending} />
      </div>
      {mode === "register" && (
        <label className="flex items-start gap-3 text-sm text-muted-foreground">
          <input type="checkbox" required className="mt-0.5 size-4 rounded border-input accent-primary" />
          <span>I agree to create a Viatik account and receive a one-time verification email.</span>
        </label>
      )}
      {message && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{message}</p>}
      <Button type="submit" className="w-full" size="lg" disabled={pending || cooldown > 0}>
        {pending ? "Sending code…" : cooldown > 0 ? `Try again in ${cooldown}s` : mode === "register" ? "Create account with email" : "Sign in with email"}
      </Button>
      {mode === "login" && (
        <div className="space-y-3 border-t pt-5">
          <Button type="button" variant="outline" className="w-full" size="lg" disabled={pending} onClick={signInWithPasskey}>
            <KeyRound className="size-4" />Sign in with a passkey
          </Button>
          <p className="text-center text-xs text-muted-foreground">Use a passkey already registered with your Viatik account.</p>
        </div>
      )}
      <p className="text-center text-sm text-muted-foreground">{mode === "register" ? "We’ll verify your email, then help you finish your profile. No password needed." : "We’ll send a secure 6-digit code. This will not create a new account."}</p>
      {mode === "login" && process.env.NODE_ENV === "development" && (
        <div className="border-t pt-5">
          <Button type="button" variant="outline" className="w-full" disabled={pending} onClick={openDevelopmentAccount}>Open development account</Button>
          <p className="mt-2 text-center text-xs text-muted-foreground">Local development only. No email is sent.</p>
        </div>
      )}
      <p className="text-center text-sm">
        {mode === "register" ? "Already have an account? " : "New to Viatik? "}
        <Link className="font-medium text-primary hover:underline" href={mode === "register" ? "/login" : "/register"}>
          {mode === "register" ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </form>
  );
}
