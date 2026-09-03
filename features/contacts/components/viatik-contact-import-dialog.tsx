"use client";

import { Camera, Link2, LoaderCircle, ScanLine, ShieldCheck, UserRound, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { lookupViatikProfile } from "@/app/actions/contacts";
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
import { contactRepository } from "@/features/contacts/data/dexie-contact-repository";
import type { Contact, ContactRelationship, ViatikProfileLookup } from "@/features/domain/entities";

interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue?: string }>>;
}

interface BarcodeDetectorConstructor {
  new (options: { formats: string[] }): BarcodeDetectorLike;
}

type ScannerWindow = Window & typeof globalThis & { BarcodeDetector?: BarcodeDetectorConstructor };

export function ViatikContactImportDialog({
  open,
  userId,
  onOpenChange,
  onLinked,
}: {
  open: boolean;
  userId: string;
  onOpenChange: (open: boolean) => void;
  onLinked?: (contact: Contact) => Promise<void> | void;
}) {
  const [identifier, setIdentifier] = useState("");
  const [profile, setProfile] = useState<ViatikProfileLookup | null>(null);
  const [relationship, setRelationship] = useState<ContactRelationship>("friend");
  const [error, setError] = useState<string | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const detectingRef = useRef(false);

  const stopScanner = useCallback(() => {
    if (scanTimerRef.current) clearInterval(scanTimerRef.current);
    scanTimerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    detectingRef.current = false;
    setScanning(false);
  }, []);

  useEffect(() => stopScanner, [open, stopScanner]);

  async function resolveProfile(value: string) {
    setLookingUp(true);
    setError(null);
    setProfile(null);
    const result = await lookupViatikProfile(value);
    setLookingUp(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setIdentifier(result.profile.viatikId);
    setProfile(result.profile);
    stopScanner();
  }

  async function startScanner() {
    const Detector = (window as ScannerWindow).BarcodeDetector;
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setError("QR scanning is not supported in this browser. Enter the Viatik ID instead.");
      return;
    }
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      setScanning(true);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const video = videoRef.current;
      if (!video) throw new Error("Camera preview is unavailable.");
      video.srcObject = stream;
      await video.play();
      const detector = new Detector({ formats: ["qr_code"] });
      scanTimerRef.current = setInterval(() => {
        if (detectingRef.current || !videoRef.current) return;
        detectingRef.current = true;
        void detector
          .detect(videoRef.current)
          .then((codes) => {
            const value = codes.find((code) => code.rawValue)?.rawValue;
            if (value) void resolveProfile(value);
          })
          .catch(() => setError("The QR code could not be read. Try again or enter the ID."))
          .finally(() => {
            detectingRef.current = false;
          });
      }, 500);
    } catch (cause) {
      stopScanner();
      setError(cause instanceof Error && cause.name === "NotAllowedError"
        ? "Camera access was denied. Allow access or enter the Viatik ID instead."
        : "The camera could not be started. Enter the Viatik ID instead.");
    }
  }

  async function saveLinkedContact() {
    if (!profile) return;
    setSaving(true);
    setError(null);
    try {
      const existing = (await contactRepository.list(userId)).find(
        (contact) => contact.linkedProfileId === profile.profileId
      );
      const contact = existing ?? await contactRepository.create({
        id: crypto.randomUUID(),
        ownerId: userId,
        fullName: profile.fullName,
        relationship,
        linkedProfileId: profile.profileId,
        linkedAvatarUrl: profile.avatarUrl,
        linkedHandle: profile.publicHandle,
        preferredCurrency: profile.preferredCurrency,
        preferredLanguage: profile.preferredLanguage,
      });
      await onLinked?.(contact);
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The linked contact could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !saving && onOpenChange(value)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="mb-2 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Link2 className="size-5" />
          </div>
          <DialogTitle>Link a Viatik account</DialogTitle>
          <DialogDescription>
            Enter their Viatik ID or scan their profile QR code. Private account details are never shared.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              void resolveProfile(identifier);
            }}
          >
            <Label htmlFor="viatik-profile-id">Viatik ID</Label>
            <div className="flex gap-2">
              <Input
                id="viatik-profile-id"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="VTK-1234ABCD5678EF90"
                autoComplete="off"
                spellCheck={false}
              />
              <Button type="submit" disabled={lookingUp || !identifier.trim()}>
                {lookingUp ? <LoaderCircle className="animate-spin" /> : null}
                Find account
              </Button>
            </div>
          </form>

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" />
          </div>

          {scanning ? (
            <div className="relative overflow-hidden rounded-xl border bg-black">
              <video ref={videoRef} muted playsInline className="aspect-video w-full object-cover" />
              <div className="pointer-events-none absolute inset-6 rounded-xl border-2 border-white/80" />
              <Button type="button" size="sm" variant="secondary" className="absolute right-3 top-3" onClick={stopScanner}>
                <X /> Stop camera
              </Button>
            </div>
          ) : (
            <Button type="button" variant="outline" className="w-full" onClick={() => void startScanner()}>
              <Camera /> Scan profile QR code
            </Button>
          )}

          {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

          {profile && (
            <section className="rounded-xl border border-primary/25 bg-primary/5 p-4" aria-label="Resolved Viatik account">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {profile.fullName.slice(0, 2).toUpperCase() || <UserRound />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{profile.fullName}</p>
                  <p className="text-xs text-muted-foreground">
                    {profile.publicHandle ? `@${profile.publicHandle}` : profile.viatikId}
                  </p>
                </div>
                <ShieldCheck className="size-5 text-success" aria-label="Verified Viatik account" />
              </div>
              <div className="mt-4 space-y-2">
                <Label htmlFor="linked-relationship">Relationship</Label>
                <select
                  id="linked-relationship"
                  value={relationship}
                  onChange={(event) => setRelationship(event.target.value as ContactRelationship)}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="family">Family</option>
                  <option value="friend">Friend</option>
                  <option value="coworker">Coworker</option>
                  <option value="roommate">Roommate</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </section>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!profile || saving} onClick={() => void saveLinkedContact()}>
            {saving ? <LoaderCircle className="animate-spin" /> : <ScanLine />}
            Save linked contact
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
