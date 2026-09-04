"use client";

import { Copy, Eye, EyeOff, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { VaultEntry, VaultEntryValues } from "@/features/vault/domain/vault-types";

export function VaultEntryCard({
  entry,
  values,
  onEdit,
  onDelete,
  onCopy,
}: {
  entry: VaultEntry;
  values?: VaultEntryValues;
  onEdit: () => void;
  onDelete: () => void;
  onCopy: (text: string, label: string) => void;
}) {
  const [revealed, setRevealed] = useState(false);

  if (!values) {
    return (
      <div data-entry-id={entry.id} className="rounded-2xl border bg-card p-5">
        <div className="h-5 w-1/3 animate-pulse rounded bg-muted" />
        <div className="mt-3 h-4 w-1/2 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  const masked = "•".repeat(Math.min(values.secret.length, 24));

  return (
    <div data-entry-id={entry.id} className="rounded-2xl border bg-card p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="truncate font-semibold">{values.title}</h3>
          {values.username && (
            <p className="text-sm text-muted-foreground">
              <span className="sr-only">Username</span>
              {values.username}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-pressed={revealed}
            aria-label={revealed ? "Hide secret" : "Show secret"}
            onClick={() => setRevealed((value) => !value)}
            className="size-10"
          >
            {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Copy secret for ${values.title}`}
            onClick={() => onCopy(values.secret, `secret for ${values.title}`)}
            className="size-10"
          >
            <Copy className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Edit ${values.title}`}
            onClick={onEdit}
            className="size-10"
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Delete ${values.title}`}
            onClick={onDelete}
            className="size-10"
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3 rounded-lg bg-muted p-3">
        <span
          className="min-w-0 flex-1 font-mono text-sm break-all"
          aria-live="polite"
          aria-label={revealed ? "Secret revealed" : "Secret hidden"}
        >
          {revealed ? values.secret : masked}
        </span>
      </div>

      {values.notes && (
        <p className="mt-3 text-sm text-muted-foreground">{values.notes}</p>
      )}
    </div>
  );
}
