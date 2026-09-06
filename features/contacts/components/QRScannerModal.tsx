"use client";

import { Camera, Check, LoaderCircle, QrCode, ScanLine, ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "react-qr-code";

import { getConnectionQrPayload, processScannedConnectionToken, type ScanConnectionResult } from "@/app/actions/connections";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { contactRepository } from "@/features/contacts/data/dexie-contact-repository";
import { profileToConnectionSnapshot, type CurrentPublicProfile } from "@/features/contacts/lib/profile-directory";
import type { ViatikProfileLookup } from "@/features/domain/entities";
import { cn } from "@/lib/utils";

interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue?: string }>>;
}
interface BarcodeDetectorConstructor {
  new (options: { formats: string[] }): BarcodeDetectorLike;
}
type ScannerWindow = Window & typeof globalThis & { BarcodeDetector?: BarcodeDetectorConstructor };

type View = "scan" | "code";

function hapticFeedback() {
  try {
    navigator.vibrate?.(50);
  } catch {
    // haptics unsupported — ignore
  }
}

export function QRScannerModal({
  open,
  onOpenChange,
  userId,
  ownProfile,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  ownProfile: CurrentPublicProfile;
}) {
  const [view, setView] = useState<View>("scan");
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanConnectionResult | null>(null);
  const [qrValue, setQrValue] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const detectingRef = useRef(false);

  const ownSnapshot = useMemo(() => profileToConnectionSnapshot(ownProfile), [ownProfile]);

  const stopScanner = useCallback(() => {
    if (scanTimerRef.current) clearInterval(scanTimerRef.current);
    scanTimerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    detectingRef.current = false;
    setScanning(false);
  }, []);

  useEffect(() => stopScanner, [stopScanner]);

  async function startScanner() {
    const Detector = (window as ScannerWindow).BarcodeDetector;
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setError("QR scanning isn't supported in this browser. Enter the Viatik ID instead.");
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
        if (detectingRef.current || !videoRef.current || result) return;
        detectingRef.current = true;
        void detector
          .detect(videoRef.current)
          .then((codes) => {
            const value = codes.find((code) => code.rawValue)?.rawValue;
            if (value) void handleScan(value);
          })
          .catch(() => setError("The QR code could not be read. Try again."))
          .finally(() => {
            detectingRef.current = false;
          });
      }, 400);
    } catch (cause) {
      stopScanner();
      setError(
        cause instanceof Error && cause.name === "NotAllowedError"
          ? "Camera access was denied. Allow access or enter the Viatik ID instead."
          : "The camera could not be started. Enter the Viatik ID instead."
      );
    }
  }

  async function handleScan(value: string) {
    const res = await processScannedConnectionToken(value);
    if (!res.success) {
      setError(res.error);
      return;
    }
    hapticFeedback();
    stopScanner();
    setResult(res);
    setError(null);
    const profile: ViatikProfileLookup = {
      profileId: res.profileId,
      viatikId: res.viatikId ?? "",
      fullName: res.displayName,
      avatarUrl: res.avatarUrl,
      avatarSeed: res.avatarSeed,
      publicHandle: null,
      preferredCurrency: null,
      preferredLanguage: null,
    };
    try {
      await contactRepository.recordAcceptedConnection(userId, profile, ownSnapshot, res.connectionId);
    } catch {
      // The remote edge exists; a subsequent pull reconciles the local row.
    }
  }

  function switchView(next: View) {
    setView(next);
    setError(null);
    if (next === "scan") {
      void startScanner();
    } else {
      stopScanner();
      void loadMyCode();
    }
  }

  async function loadMyCode() {
    setQrLoading(true);
    setQrError(null);
    const payload = await getConnectionQrPayload();
    setQrLoading(false);
    if (!payload.success) {
      setQrError(payload.error);
      return;
    }
    setQrValue(payload.qrValue);
  }

  function dismiss() {
    if (result) {
      // Delay so the Connected! state is visible before closing.
      setTimeout(() => onOpenChange(false), 900);
    } else {
      onOpenChange(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-2xl sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Connect by QR code"
      onClick={(event) => event.target === event.currentTarget && dismiss()}
    >
      <section className="w-full max-w-md overflow-hidden rounded-t-3xl border border-border/40 bg-background/80 shadow-2xl shadow-black/20 backdrop-blur-2xl transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] sm:rounded-3xl">
        <header className="flex items-center justify-between px-5 pt-5">
          <div className="flex items-center gap-2">
            <QrCode className="size-5 text-primary" />
            <h2 className="text-lg font-semibold">Connect with QR</h2>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Close"
            className="grid size-11 place-items-center rounded-full border border-border/40 text-muted-foreground transition-colors hover:bg-accent"
          >
            <X className="size-5" />
          </button>
        </header>

        <div className="px-5 pt-4">
          <div className="flex rounded-xl border border-border/40 bg-muted/40 p-1">
            {(["scan", "code"] as View[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => switchView(v)}
                className={cn(
                  "flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]",
                  view === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {v === "scan" ? <ScanLine className="size-4" /> : <QrCode className="size-4" />}
                {v === "scan" ? "Scan their code" : "Show my code"}
              </button>
            ))}
          </div>
        </div>

        <div className="p-5">
          {view === "scan" ? (
            result?.success ? (
              <ConnectedState result={result} />
            ) : scanning ? (
              <div className="relative aspect-square overflow-hidden rounded-3xl border border-border/40 bg-black">
                <video ref={videoRef} muted playsInline className="size-full object-cover" />
                <ScanFrame />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void startScanner()}
                className="flex min-h-72 w-full flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-border/60 text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
              >
                <Camera className="size-8" />
                <span className="text-sm font-medium">Start camera</span>
              </button>
            )
          ) : (
            <div className="flex flex-col items-center gap-4 py-2">
              {qrLoading ? (
                <div className="grid min-h-64 place-items-center">
                  <LoaderCircle className="size-7 animate-spin text-primary" />
                </div>
              ) : qrError ? (
                <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-center text-sm text-destructive">{qrError}</p>
              ) : qrValue ? (
                <>
                  <div className="rounded-3xl border border-border/40 bg-white p-5 shadow-sm">
                    <QRCode value={qrValue} size={208} fgColor="#111827" />
                  </div>
                  <p className="text-center text-sm text-muted-foreground">
                    They scan this to instantly connect — no request needed.
                  </p>
                  <p className="inline-flex items-center gap-1.5 text-xs text-success">
                    <ShieldCheck className="size-4" /> Signed &amp; expires in 5 minutes
                  </p>
                </>
              ) : null}
            </div>
          )}

          {error && <p role="alert" className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

          <Button type="button" variant="outline" className="mt-4 min-h-11 w-full" onClick={dismiss}>
            Done
          </Button>
        </div>
      </section>
    </div>
  );
}

type ScanConnectionSuccess = Extract<ScanConnectionResult, { success: true }>;

function ConnectedState({ result }: { result: ScanConnectionSuccess }) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center gap-4 rounded-3xl border border-success/30 bg-success/5 p-6 text-center">
      <span className="grid size-16 place-items-center rounded-full bg-success/15">
        <Check className="size-8 text-success" />
      </span>
      <div className="flex items-center gap-3">
        <UserAvatar seed={result.avatarSeed} src={result.avatarUrl} name={result.displayName} size="md" />
        <div className="text-left">
          <p className="font-semibold">{result.displayName}</p>
          <p className="text-xs text-muted-foreground">{result.viatikId}</p>
        </div>
      </div>
      <p className="text-lg font-medium text-success">🟢 Connected!</p>
    </div>
  );
}

function ScanFrame() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {/* Corner reticles */}
      <span className="absolute left-4 top-4 h-8 w-8 border-l-2 border-t-2 border-white/90 animate-pulse" />
      <span className="absolute right-4 top-4 h-8 w-8 border-r-2 border-t-2 border-white/90 animate-pulse" />
      <span className="absolute bottom-4 left-4 h-8 w-8 border-b-2 border-l-2 border-white/90 animate-pulse" />
      <span className="absolute bottom-4 right-4 h-8 w-8 border-b-2 border-r-2 border-white/90 animate-pulse" />
      {/* Sweeping scan line */}
      <span className="absolute inset-x-8 top-0 h-0.5 animate-scan-line bg-gradient-to-r from-transparent via-primary to-transparent" />
    </div>
  );
}
