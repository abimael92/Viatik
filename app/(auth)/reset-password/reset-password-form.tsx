"use client";

import { Check, Eye, EyeOff, Lock } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";

import { updatePassword } from "@/app/actions/auth";
import { passwordRejection } from "@/lib/auth/password-recovery";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { localizeUserError } from "@/lib/i18n/localize-error";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { cn } from "@/lib/utils";

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

export function ResetPasswordForm({ canReset }: { canReset: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const strength = passwordStrength(password, t);
  const passwordsMatch = password === confirmPassword;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    if (!passwordsMatch) {
      setMessage(t("auth.mismatch"));
      return;
    }
    startTransition(async () => {
      const result = await updatePassword(password);
      if (!result.success) {
        setMessage(localizeUserError(result.error, t, "errors.unexpected"));
        return;
      }
      router.replace("/home");
      router.refresh();
    });
  }

  if (!canReset) {
    return (
      <div className="space-y-6">
        <div>
          <p className="mb-2 text-sm font-semibold text-primary">{t("auth.existingAccount")}</p>
          <h1 className="text-3xl font-bold tracking-tight">{t("auth.resetLinkInvalidTitle")}</h1>
          <p className="mt-2 text-muted-foreground">{t("auth.resetLinkInvalidBody")}</p>
        </div>
        <Button asChild variant="primary" className="w-full" size="lg">
          <Link href="/forgot-password">{t("auth.requestNewLink")}</Link>
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
        <h1 className="text-3xl font-bold tracking-tight">{t("auth.resetPasswordTitle")}</h1>
        <p className="mt-2 text-muted-foreground">{t("auth.resetPasswordDescription")}</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">{t("auth.newPassword")}</Label>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder={t("auth.passwordHint")}
            minLength={8}
            required
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={pending}
            className="pl-9 pr-10"
          />
          <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {password && (
          <>
            <div className="flex items-center gap-2">
              <div className="flex flex-1 gap-1" aria-hidden="true">
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
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">{t("auth.confirmPassword")}</Label>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type={showConfirm ? "text" : "password"}
            autoComplete="new-password"
            placeholder={t("auth.repeatPassword")}
            required
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            disabled={pending}
            className="pl-9 pr-10"
          />
          <button type="button" onClick={() => setShowConfirm((value) => !value)} aria-label={showConfirm ? t("auth.hidePassword") : t("auth.showPassword")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {confirmPassword && !passwordsMatch && <p className="text-xs text-destructive">{t("auth.mismatch")}</p>}
      </div>
      {message && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{message}</p>}
      <Button type="submit" variant="primary" className="w-full" size="lg" disabled={pending || Boolean(passwordRejection(password)) || !passwordsMatch}>
        {pending ? t("auth.pleaseWait") : t("auth.saveNewPassword")}
      </Button>
      <Link href="/login" className="block text-center text-sm font-semibold text-primary hover:underline">
        {t("auth.backToSignIn")}
      </Link>
    </form>
  );
}
