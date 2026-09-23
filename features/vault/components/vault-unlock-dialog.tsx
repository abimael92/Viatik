"use client";

import { Check, Eye, EyeOff, Shield } from "lucide-react";
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
import { cn } from "@/lib/utils";

function passphraseStrength(passphrase: string) {
  const rules = [
    { label: "At least 8 characters", met: passphrase.length >= 8 },
    { label: "Uppercase letter", met: /[A-Z]/.test(passphrase) },
    { label: "Lowercase letter", met: /[a-z]/.test(passphrase) },
    { label: "A number", met: /\d/.test(passphrase) },
    { label: "A symbol", met: /[^A-Za-z0-9]/.test(passphrase) },
  ];
  const score = rules.filter((rule) => rule.met).length;
  const meta =
    score <= 2
      ? { label: "Weak", bar: "bg-destructive" }
      : score === 3
        ? { label: "Fair", bar: "bg-amber-500" }
        : score === 4
          ? { label: "Good", bar: "bg-lime-500" }
          : { label: "Strong", bar: "bg-success" };
  return { score, rules, meta };
}

export function VaultUnlockDialog({
  open,
  mode,
  onOpenChange,
  onUnlock,
  onCreate,
  pending,
  error,
}: {
  open: boolean;
  mode: "unlock" | "create";
  onOpenChange: (open: boolean) => void;
  onUnlock: (passphrase: string) => Promise<void> | void;
  onCreate: (passphrase: string) => Promise<void> | void;
  pending?: boolean;
  error?: string | null;
}) {
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);
  const strength = passphraseStrength(passphrase);
  const passphrasesMatch = passphrase === confirm;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidation(null);

    if (passphrase.length < 8) {
      setValidation("Passphrase must be at least 8 characters.");
      return;
    }
    if (mode === "create" && strength.score < 4) {
      setValidation("Choose a stronger passphrase using the checks below.");
      return;
    }
    if (mode === "create" && !passphrasesMatch) {
      setValidation("Passphrases do not match.");
      return;
    }

    if (mode === "create") {
      await onCreate(passphrase);
    } else {
      await onUnlock(passphrase);
    }
  }

  const title = mode === "create" ? "Create vault passphrase" : "Unlock vault";
  const description =
    mode === "create"
      ? "This passphrase is the only way to decrypt your entries. If you lose it, no one—including Viatik—can recover your data."
      : "Enter your vault passphrase to decrypt your private entries.";

  return (
    <Dialog open={open} onOpenChange={(value) => !pending && onOpenChange(value)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <Shield className="size-5" />
            </span>
            <div>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="vault-passphrase">
              {mode === "create" ? "Passphrase" : "Passphrase"}
            </Label>
            <div className="relative">
              <Input
                id="vault-passphrase"
                type={showPassphrase ? "text" : "password"}
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                autoFocus
                aria-describedby="vault-passphrase-help"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassphrase((value) => !value)}
                aria-pressed={showPassphrase}
                aria-label={showPassphrase ? "Hide passphrase" : "Show passphrase"}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {showPassphrase ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
              </button>
            </div>
            <p id="vault-passphrase-help" className="text-xs text-muted-foreground">
              Use a strong, memorable passphrase. Minimum 8 characters.
            </p>
            {mode === "create" && passphrase && (
              <>
                <div className="flex items-center gap-2">
                  <div className="flex flex-1 gap-1">
                    {Array.from({ length: 5 }, (_, index) => (
                      <div
                        key={index}
                        className={cn("h-1.5 flex-1 rounded-full", index < strength.score ? strength.meta.bar : "bg-muted")}
                      />
                    ))}
                  </div>
                  <span className="text-xs font-semibold text-muted-foreground">{strength.meta.label}</span>
                </div>
                <ul className="grid gap-1 text-xs sm:grid-cols-2">
                  {strength.rules.map((rule) => (
                    <li key={rule.label} className={cn("flex items-center gap-1.5", rule.met ? "text-success" : "text-muted-foreground")}>
                      <Check className="size-3.5" aria-hidden />
                      {rule.label}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          {mode === "create" && (
            <div className="space-y-2">
              <Label htmlFor="vault-passphrase-confirm">Confirm passphrase</Label>
              <div className="relative">
                <Input
                  id="vault-passphrase-confirm"
                  type={showConfirm ? "text" : "password"}
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                  className="pr-10"
                  aria-describedby={confirm && !passphrasesMatch ? "vault-passphrase-mismatch" : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((value) => !value)}
                  aria-pressed={showConfirm}
                  aria-label={showConfirm ? "Hide confirm passphrase" : "Show confirm passphrase"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {showConfirm ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                </button>
              </div>
              {confirm && !passphrasesMatch && (
                <p id="vault-passphrase-mismatch" className="text-xs text-destructive">
                  Passphrases don&apos;t match.
                </p>
              )}
            </div>
          )}

          {mode === "create" && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
              <strong>Important:</strong> If you forget this passphrase, your vault entries cannot be
              recovered. Store it somewhere safe.
            </div>
          )}

          {(validation || error) && (
            <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {validation ?? error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? (mode === "create" ? "Creating…" : "Unlocking…") : mode === "create" ? "Create vault" : "Unlock"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
