"use client";

import { Check, Copy, Link2, Plus, Share2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Heading } from "@/components/ui/heading";
import { shareLinkRepository } from "@/features/sharing/data/dexie-share-repository";
import type { TripShareLink } from "@/features/sharing/domain/share-types";
import { cn } from "@/lib/utils";

/**
 * Share settings modal. The trip owner generates read-only guest links, copies
 * the share URL, and toggles which sections (itinerary / map / gallery) each
 * link exposes. Links are local-first (offline) and sync to Supabase so guests
 * can open them without an account.
 */
export function ShareModal({
  open,
  onOpenChange,
  tripId,
  userId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  userId: string;
}) {
  const [links, setLinks] = useState<TripShareLink[]>([]);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  useEffect(() => shareLinkRepository.watchByTrip(tripId, setLinks), [tripId]);

  const shareUrl = useCallback(
    (slug: string) => `${origin}/share/${slug}`,
    [origin],
  );

  const handleCreate = useCallback(async () => {
    setCreating(true);
    setError(null);
    try {
      await shareLinkRepository.create({ tripId, createdBy: userId });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create a share link.");
    } finally {
      setCreating(false);
    }
  }, [tripId, userId]);

  const handleToggle = useCallback(
    async (link: TripShareLink, patch: Partial<Omit<TripShareLink, "id" | "tripId" | "slug" | "createdBy">>) => {
      setError(null);
      try {
        await shareLinkRepository.update(link.id, patch);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Unable to update the share link.");
      }
    },
    [],
  );

  const handleDelete = useCallback(async (id: string) => {
    setError(null);
    try {
      await shareLinkRepository.remove(id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to remove the share link.");
    }
  }, []);

  const handleCopy = useCallback(async (slug: string) => {
    const url = shareUrl(slug);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(slug);
      setTimeout(() => setCopiedId((current) => (current === slug ? null : current)), 2000);
    } catch {
      // Clipboard may be unavailable; surface the URL as fallback text.
      setCopiedId(null);
      setError(`Copy this link manually: ${url}`);
    }
  }, [shareUrl]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Share trip</DialogTitle>
          <DialogDescription>
            Generate a read-only link so family and friends can follow along without a Viatik account.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <Share2 className="size-5" aria-hidden />
            </span>
            <div>
              <Heading level={3} className="text-base font-semibold">Guest links</Heading>
              <p className="text-sm text-muted-foreground">Each link is private and can be disabled anytime.</p>
            </div>
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
          )}

          {links.length === 0 && !creating && (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              No share links yet. Create one to let guests view this trip.
            </p>
          )}

          {links.map((link) => (
            <div
              key={link.id}
              className={cn("rounded-2xl border bg-card p-4", !link.active && "opacity-60")}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Link2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate font-mono text-sm font-semibold">{link.slug}</span>
                  <Badge variant={link.active ? "success" : "muted"}>
                    {link.active ? "Active" : "Off"}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void handleCopy(link.slug)}
                    aria-label={`Copy link ${link.slug}`}
                  >
                    {copiedId === link.slug ? <Check className="size-4" /> : <Copy className="size-4" />}
                    {copiedId === link.slug ? "Copied" : "Copy"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => void handleToggle(link, { active: !link.active })}
                  >
                    {link.active ? "Disable" : "Enable"}
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => void handleDelete(link.id)}
                    className="size-9 text-muted-foreground hover:text-destructive"
                    aria-label={`Delete link ${link.slug}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>

              <p className="mt-2 truncate text-xs text-muted-foreground">{shareUrl(link.slug)}</p>

              <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
                <Toggle
                  label="Itinerary"
                  on={link.allowItinerary}
                  onClick={() => void handleToggle(link, { allowItinerary: !link.allowItinerary })}
                />
                <Toggle
                  label="Map"
                  on={link.allowMap}
                  onClick={() => void handleToggle(link, { allowMap: !link.allowMap })}
                />
                <Toggle
                  label="Photos"
                  on={link.allowGallery}
                  onClick={() => void handleToggle(link, { allowGallery: !link.allowGallery })}
                />
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button type="button" variant="primary" onClick={() => void handleCreate()} disabled={creating}>
            {creating ? <span className="size-4 animate-pulse" /> : <Plus className="size-4" />}
            New link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        on
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:border-primary/40",
      )}
    >
      {label} {on ? "on" : "off"}
    </button>
  );
}
