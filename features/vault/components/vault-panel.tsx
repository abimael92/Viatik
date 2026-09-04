"use client";

import { Lock, Plus, Shield, Unlock } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import type { VaultEntry, VaultEntryValues, VaultKeyset } from "@/features/vault/domain/vault-types";
import { vaultRepository } from "@/features/vault/data/dexie-vault-repository";
import { webCryptoVault, type VaultSession } from "@/lib/security/web-crypto-vault";
import { VaultUnlockDialog } from "./vault-unlock-dialog";
import { VaultEntryDialog } from "./vault-entry-dialog";
import { VaultEntryCard } from "./vault-entry-card";

export function VaultPanel({ tripId, userId }: { tripId: string; userId: string }) {
  const [keyset, setKeyset] = useState<VaultKeyset | null | undefined>(undefined);
  const [session, setSession] = useState<VaultSession | null>(() => webCryptoVault.getSession(userId) ?? null);
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [decrypted, setDecrypted] = useState<Map<string, VaultEntryValues>>(new Map());
  const [dialog, setDialog] = useState<"unlock" | "entry" | null>(null);
  const [editing, setEditing] = useState<VaultEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [copyToast, setCopyToast] = useState<string | null>(null);

  useEffect(() => {
    vaultRepository.getKeyset(userId).then((value) => setKeyset(value ?? null));
    return vaultRepository.watchEntries(tripId, userId, (list) => {
      setEntries(list);
    });
  }, [tripId, userId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!session) return;
      const next = new Map<string, VaultEntryValues>();
      for (const entry of entries) {
        if (cancelled) return;
        try {
          const values = await webCryptoVault.decrypt(entry, session);
          next.set(entry.id, values);
        } catch {
          next.set(entry.id, { title: entry.id, username: null, secret: "Unable to decrypt", notes: null });
        }
      }
      if (!cancelled) setDecrypted(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [entries, session, userId]);

  const handleUnlock = useCallback(
    async (passphrase: string) => {
      setPending(true);
      setError(null);
      try {
        const ks = keyset ?? (await vaultRepository.getKeyset(userId));
        if (!ks) throw new Error("No vault keyset found. Create one first.");
        const newSession = await webCryptoVault.unlock(passphrase, ks);
        setSession(newSession);
        setDialog(null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Unable to unlock vault.");
      } finally {
        setPending(false);
      }
    },
    [keyset, userId]
  );

  const handleCreateKeyset = useCallback(
    async (passphrase: string) => {
      setPending(true);
      setError(null);
      try {
        const ks = await vaultRepository.createKeyset({
          id: crypto.randomUUID(),
          ownerId: userId,
          passphrase,
        });
        const newSession = await webCryptoVault.unlock(passphrase, ks);
        setKeyset(ks);
        setSession(newSession);
        setDialog(null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Unable to create vault.");
      } finally {
        setPending(false);
      }
    },
    [userId]
  );

  const handleSave = useCallback(
    async (values: VaultEntryValues) => {
      if (!session) return;
      setPending(true);
      setError(null);
      try {
        if (editing) {
          const payload = await webCryptoVault.encrypt(
            { id: editing.id, tripId, ownerId: userId, values },
            session
          );
          await vaultRepository.updateEntry(editing.id, userId, values, payload);
        } else {
          const id = crypto.randomUUID();
          const payload = await webCryptoVault.encrypt({ id, tripId, ownerId: userId, values }, session);
          await vaultRepository.createEntry({ id, tripId, ownerId: userId, values }, payload);
        }
        setDialog(null);
        setEditing(null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Unable to save entry.");
      } finally {
        setPending(false);
      }
    },
    [editing, session, tripId, userId]
  );

  const handleDelete = useCallback(
    async (entry: VaultEntry) => {
      if (!window.confirm(`Delete “${decrypted.get(entry.id)?.title ?? entry.id}” from your vault?`)) return;
      try {
        await vaultRepository.removeEntry(entry.id, userId);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Unable to delete entry.");
      }
    },
    [decrypted, userId]
  );

  const handleCopy = useCallback(
    async (text: string, label: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopyToast(`Copied ${label}`);
        window.setTimeout(() => setCopyToast((current) => (current === `Copied ${label}` ? null : current)), 2000);
      } catch {
        setError("Clipboard access denied.");
      }
    },
    []
  );

  const handleLock = useCallback(() => {
    webCryptoVault.lock(userId);
    setSession(null);
    setDecrypted(new Map());
  }, [userId]);

  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)),
    [entries]
  );

  return (
    <section className="space-y-6" aria-labelledby="vault-heading">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="vault-heading" className="text-2xl font-bold">
            Vault
          </h2>
          <p className="text-muted-foreground">Private, encrypted notes and credentials for this trip.</p>
        </div>
        {session && (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleLock}>
              <Lock className="size-4" /> Lock
            </Button>
            <Button onClick={() => { setEditing(null); setDialog("entry"); }}>
              <Plus className="size-4" /> Add entry
            </Button>
          </div>
        )}
      </div>

      {!session && (
        <div className="rounded-2xl border bg-card p-8 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
            <Shield className="size-6" />
          </span>
          <h3 className="mt-4 font-semibold">Your vault is locked</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {keyset === undefined
              ? "Checking vault status…"
              : keyset === null
                ? "Create a passphrase to start storing encrypted entries."
                : "Unlock with your passphrase to view your private entries."}
          </p>
          <Button
            className="mt-5"
            onClick={() => setDialog("unlock")}
            disabled={keyset === undefined}
          >
            <Unlock className="size-4" />
            {keyset ? "Unlock vault" : "Create vault"}
          </Button>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {copyToast && (
        <p role="status" aria-live="polite" className="rounded-lg bg-primary/10 p-3 text-sm text-primary">
          {copyToast}
        </p>
      )}

      {session && (
        <div className="grid gap-4">
          {sortedEntries.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-10 text-center">
              <p className="text-muted-foreground">No entries yet.</p>
              <Button className="mt-4" onClick={() => { setEditing(null); setDialog("entry"); }}>
                <Plus className="size-4" /> Add your first entry
              </Button>
            </div>
          ) : (
            sortedEntries.map((entry) => (
              <VaultEntryCard
                key={entry.id}
                entry={entry}
                values={decrypted.get(entry.id)}
                onEdit={() => { setEditing(entry); setDialog("entry"); }}
                onDelete={() => handleDelete(entry)}
                onCopy={handleCopy}
              />
            ))
          )}
        </div>
      )}

      <VaultUnlockDialog
        key={dialog === "unlock" ? "unlock-open" : "unlock-closed"}
        open={dialog === "unlock"}
        mode={keyset ? "unlock" : "create"}
        onOpenChange={(open) => { if (!open) setDialog(null); }}
        onUnlock={handleUnlock}
        onCreate={handleCreateKeyset}
        pending={pending}
        error={error}
      />

      <VaultEntryDialog
        key={dialog === "entry" ? (editing?.id ?? "entry-new") : "entry-closed"}
        open={dialog === "entry"}
        values={editing ? decrypted.get(editing.id) : undefined}
        onOpenChange={(open) => { if (!open) { setDialog(null); setEditing(null); } }}
        onSave={handleSave}
        pending={pending}
        error={error}
      />
    </section>
  );
}
