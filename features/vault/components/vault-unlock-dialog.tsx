"use client";

import { Eye, EyeOff, Shield } from "lucide-react";
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
  const [show, setShow] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidation(null);

    if (passphrase.length < 8) {
      setValidation("Passphrase must be at least 8 characters.");
      return;
    }
    if (mode === "create" && passphrase !== confirm) {
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
                type={show ? "text" : "password"}
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                autoFocus
                aria-describedby="vault-passphrase-help"
              />
              <button
                type="button"
                onClick={() => setShow((value) => !value)}
                aria-pressed={show}
                aria-label={show ? "Hide passphrase" : "Show passphrase"}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <p id="vault-passphrase-help" className="text-xs text-muted-foreground">
              Use a strong, memorable passphrase. Minimum 8 characters.
            </p>
          </div>

          {mode === "create" && (
            <div className="space-y-2">
              <Label htmlFor="vault-passphrase-confirm">Confirm passphrase</Label>
              <Input
                id="vault-passphrase-confirm"
                type={show ? "text" : "password"}
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
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
            <Button type="submit" disabled={pending}>
              {pending ? (mode === "create" ? "Creating…" : "Unlocking…") : mode === "create" ? "Create vault" : "Unlock"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
