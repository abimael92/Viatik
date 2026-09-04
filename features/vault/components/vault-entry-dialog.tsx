"use client";

import { Eye, EyeOff } from "lucide-react";
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
import type { VaultEntryValues } from "@/features/vault/domain/vault-types";

export function VaultEntryDialog({
  open,
  values,
  onOpenChange,
  onSave,
  pending,
  error,
}: {
  open: boolean;
  values?: VaultEntryValues;
  onOpenChange: (open: boolean) => void;
  onSave: (values: VaultEntryValues) => Promise<void> | void;
  pending?: boolean;
  error?: string | null;
}) {
  const [title, setTitle] = useState(() => values?.title ?? "");
  const [username, setUsername] = useState(() => values?.username ?? "");
  const [secret, setSecret] = useState(() => values?.secret ?? "");
  const [notes, setNotes] = useState(() => values?.notes ?? "");
  const [showSecret, setShowSecret] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidation(null);
    if (!title.trim()) {
      setValidation("Title is required.");
      return;
    }
    if (!secret) {
      setValidation("Secret is required.");
      return;
    }
    await onSave({
      title: title.trim(),
      username: username.trim() || null,
      secret,
      notes: notes.trim() || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !pending && onOpenChange(value)}>
      <DialogContent className="max-h-[90dvh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{values ? "Edit vault entry" : "Add vault entry"}</DialogTitle>
          <DialogDescription>
            This entry is encrypted on your device before it is stored or synced.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="vault-entry-title">
              Title <span className="text-destructive" aria-hidden="true">*</span>
            </Label>
            <Input
              id="vault-entry-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Hotel safe code"
              required
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="vault-entry-username">Username (optional)</Label>
            <Input
              id="vault-entry-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="jordan@example.com"
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="vault-entry-secret">
              Secret <span className="text-destructive" aria-hidden="true">*</span>
            </Label>
            <div className="relative">
              <Input
                id="vault-entry-secret"
                type={showSecret ? "text" : "password"}
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                placeholder="••••••••"
                required
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowSecret((value) => !value)}
                aria-pressed={showSecret}
                aria-label={showSecret ? "Hide secret" : "Show secret"}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {showSecret ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="vault-entry-notes">Notes (optional)</Label>
            <textarea
              id="vault-entry-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Room 412, checkout behind the painting…"
              rows={3}
              maxLength={500}
              className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

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
              {pending ? "Saving…" : values ? "Update entry" : "Add entry"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
