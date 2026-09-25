"use client";

import { Mail } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState, useTransition } from "react";

import { requestPasswordReset } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { localizeUserError } from "@/lib/i18n/localize-error";
import { useI18n } from "@/lib/i18n/i18n-provider";

function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!name || !domain) return email;
  return `${name.slice(0, 2)}${"•".repeat(Math.max(1, name.length - 2))}@${domain}`;
}

function formatCooldown(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function ForgotPasswordForm() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await requestPasswordReset(email);
      if (!result.success) {
        setMessage(localizeUserError(result.error, t, "errors.unexpected"));
        if (result.retryAfter) setCooldown(result.retryAfter);
        return;
      }
      setEmail(email.trim().toLowerCase());
      setSent(true);
      setCooldown(60);
    });
  }

  if (sent) {
    return (
      <div className="space-y-6">
        <div>
          <p className="mb-2 text-sm font-semibold text-primary">{t("auth.existingAccount")}</p>
          <h1 className="text-3xl font-bold tracking-tight">{t("auth.checkEmail")}</h1>
          <p className="mt-2 text-muted-foreground">{t("auth.resetLinkSent", { email: maskEmail(email) })}</p>
        </div>
        <div className="rounded-xl border bg-muted/40 p-4 text-sm text-muted-foreground">
          <p>{t("auth.checkSpam")}</p>
        </div>
        {message && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{message}</p>}
        <Button type="button" variant="outline" className="w-full" size="lg" disabled={pending || cooldown > 0} onClick={() => submit()}>
          {cooldown ? t("auth.resendResetIn", { time: formatCooldown(cooldown) }) : t("auth.resendResetLink")}
        </Button>
        <Link href="/login" className="block text-center text-sm font-semibold text-primary hover:underline">
          {t("auth.backToSignIn")}
        </Link>
      </div>
    );
  }

  return (
    <form className="space-y-6" onSubmit={submit}>
      <div>
        <p className="mb-2 text-sm font-semibold text-primary">{t("auth.existingAccount")}</p>
        <h1 className="text-3xl font-bold tracking-tight">{t("auth.forgotPasswordTitle")}</h1>
        <p className="mt-2 text-muted-foreground">{t("auth.forgotPasswordDescription")}</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">{t("auth.email")}</Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder={t("copy.placeholderEmail")}
            required
            autoFocus
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={pending}
            className="pl-9"
          />
        </div>
      </div>
      {message && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{message}</p>}
      <Button type="submit" variant="primary" className="w-full" size="lg" disabled={pending || !email}>
        {pending ? t("auth.pleaseWait") : t("auth.sendResetLink")}
      </Button>
      <Link href="/login" className="block text-center text-sm font-semibold text-primary hover:underline">
        {t("auth.backToSignIn")}
      </Link>
    </form>
  );
}
