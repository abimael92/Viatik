"use client";

import { Check, LoaderCircle, QrCode, ScanLine, Send, ShieldCheck, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { lookupViatikProfile } from "@/app/actions/contacts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/ui/user-avatar";
import { contactRepository } from "@/features/contacts/data/dexie-contact-repository";
import { profileToConnectionSnapshot, type CurrentPublicProfile } from "@/features/contacts/lib/profile-directory";
import { parseViatikId } from "@/features/contacts/lib/viatik-id";
import type { ViatikProfileLookup } from "@/features/domain/entities";

export function AddContactCommandBar({
  open,
  onOpenChange,
  userId,
  ownProfile,
  onOpenScanner,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  ownProfile: CurrentPublicProfile;
  onOpenScanner?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [profile, setProfile] = useState<ViatikProfileLookup | null>(null);
  const [status, setStatus] = useState<"idle" | "looking" | "matched" | "not_found" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ownSnapshot = useMemo(() => profileToConnectionSnapshot(ownProfile), [ownProfile]);

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  function onQueryChange(value: string) {
    setQuery(value);
    setError(null);
    setProfile(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!parseViatikId(value)) {
      setStatus(value.trim() ? "not_found" : "idle");
      return;
    }
    setStatus("looking");
    debounceRef.current = setTimeout(() => {
      resolve(value).catch((err) => {
        if (value !== query) return; // stale response
        setProfile(null);
        setStatus("not_found");
        setError(err instanceof Error ? err.message : "We couldn't look up that Viatik ID right now.");
      });
    }, 350);
  }

  async function resolve(value: string) {
    // Add a timeout to prevent hanging forever
    const timeoutMs = 10000;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Lookup timed out. Please try again.")), timeoutMs)
    );
    const result = await Promise.race([lookupViatikProfile(value), timeoutPromise]);
    if (value !== query) return; // stale response
    if (!result.success) {
      setProfile(null);
      setStatus("not_found");
      setError(result.error);
      return;
    }
    setProfile(result.profile);
    setStatus("matched");
  }

  async function sendRequest() {
    if (!profile) return;
    setSending(true);
    setError(null);
    try {
      await contactRepository.sendConnectionRequest(userId, profile, ownSnapshot);
      setStatus("sent");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The request could not be sent.");
      setStatus("matched");
    } finally {
      setSending(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-md sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Add a Viatik connection"
      onClick={(event) => event.target === event.currentTarget && onOpenChange(false)}
    >
      <section className="w-full max-w-md overflow-hidden rounded-t-3xl border border-border/40 bg-background/85 shadow-2xl shadow-black/20 backdrop-blur-2xl transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] sm:rounded-3xl">
        <header className="flex items-center justify-between px-5 pt-5">
          <h2 className="text-lg font-semibold">Add a connection</h2>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            className="grid size-11 place-items-center rounded-full border border-border/40 text-muted-foreground transition-colors hover:bg-accent"
          >
            <X className="size-5" />
          </button>
        </header>

        <div className="p-5">
          <label htmlFor="viatik-id-search" className="sr-only">Viatik ID</label>
          <div className="relative">
            <ScanLine className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              id="viatik-id-search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Enter their Viatik ID, e.g. VTK-…"
              className="min-h-12 pl-12 text-base"
              autoComplete="off"
              spellCheck={false}
            />
            {status === "looking" && (
              <LoaderCircle className="absolute right-4 top-1/2 size-5 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>

          <div className="mt-4 space-y-3">
            {status === "sent" ? (
              <div className="flex items-center gap-3 rounded-2xl border border-success/30 bg-success/5 p-4 text-sm text-success">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-success/15">
                  <Check className="size-5" />
                </span>
                <span>
                  Request sent to <strong>{profile?.fullName}</strong>. We&apos;ll connect once they accept.
                </span>
              </div>
            ) : profile && status === "matched" ? (
              <div
                className="flex flex-col gap-4 rounded-2xl border border-border/40 bg-card p-4 transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]"
                aria-label="Matched Viatik account"
              >
                <div className="flex items-center gap-3">
                  <UserAvatar seed={profile.avatarSeed} src={profile.avatarUrl} name={profile.fullName} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{profile.fullName}</p>
                    <p className="text-xs text-muted-foreground">
                      {profile.publicHandle ? `@${profile.publicHandle}` : profile.viatikId}
                    </p>
                  </div>
                  <ShieldCheck className="size-5 shrink-0 text-success" aria-label="Verified Viatik account" />
                </div>
                <Button type="button" className="min-h-11 w-full" disabled={sending} onClick={() => void sendRequest()}>
                  {sending ? <LoaderCircle className="size-5 animate-spin" /> : <Send className="size-5" />}
                  Send request
                </Button>
              </div>
            ) : status === "not_found" ? (
              <div className="flex flex-col gap-3">
                {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
                <button
                  type="button"
                  onClick={onOpenScanner}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                >
                  <QrCode className="size-5" /> Scan their QR code instead
                </button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Type their Viatik ID or scan their code. Private account details are never shared.
              </p>
            )}
          </div>

          {onOpenScanner && status === "idle" && (
            <button
              type="button"
              onClick={onOpenScanner}
              className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-border/40 text-sm font-semibold transition-colors hover:bg-accent"
            >
              <QrCode className="size-5" /> Scan their QR code
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
