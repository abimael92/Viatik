"use client";

import { Camera, ImageUp, Loader2, Plane, Plus, Save, ScanText, TrainFront } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

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
import { transitRepository } from "@/features/transit/data/dexie-transit-repository";
import type { TransitMode, TransitSegment } from "@/features/transit/domain/transit-types";
import { parseTicketText } from "@/features/transit/lib/ticket-parser";
import { cn } from "@/lib/utils";

/**
 * Add a flight or train leg to the itinerary. Saved locally (offline-first);
 * live status is fetched on the card afterwards.
 */
export function AddTransitDialog({
  open,
  onOpenChange,
  tripId,
  userId,
  defaultDay,
  onError,
  segment,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  userId: string;
  /** ISO date (`yyyy-mm-dd`) to prefill. */
  defaultDay: string;
  onError?: (message: string) => void;
  segment?: TransitSegment;
}) {
  const [mode, setMode] = useState<TransitMode>(segment?.mode ?? "flight");
  const [carrier, setCarrier] = useState(segment?.carrier ?? "");
  const [carrierCode, setCarrierCode] = useState(segment?.carrierCode ?? "");
  const [number, setNumber] = useState(segment?.number ?? "");
  const [origin, setOrigin] = useState(segment?.origin ?? "");
  const [destination, setDestination] = useState(segment?.destination ?? "");
  const [dayDate, setDayDate] = useState(segment?.dayDate ?? defaultDay);
  const [departureTime, setDepartureTime] = useState(segment?.scheduledDeparture.slice(11, 16) ?? "");
  const [arrivalTime, setArrivalTime] = useState(segment?.scheduledArrival?.slice(11, 16) ?? "");
  const [station, setStation] = useState(segment ? (segment.mode === "flight" ? segment.gate ?? segment.terminal ?? "" : segment.platform ?? "") : "");
  const [ticketImage, setTicketImage] = useState<Blob | null>(segment?.ticketImage ?? null);
  const [ticketImageName, setTicketImageName] = useState<string | null>(segment?.ticketImageName ?? null);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanError, setScanError] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const ticketPreview = useMemo(() => ticketImage ? URL.createObjectURL(ticketImage) : null, [ticketImage]);
  useEffect(() => () => { if (ticketPreview) URL.revokeObjectURL(ticketPreview); }, [ticketPreview]);
  const [saving, setSaving] = useState(false);

  const canSubmit =
    carrier.trim().length > 0 &&
    number.trim().length > 0 &&
    dayDate &&
    departureTime.length > 0;

  const handleTicketImage = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setScanError("Choose an image file."); return; }
    setTicketImage(file);
    setTicketImageName(file.name);
    setScanError(null);
    setScanning(true);
    setScanProgress(0);
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng", 1, { logger: (message) => { if (message.status === "recognizing text") setScanProgress(Math.round(message.progress * 100)); } });
      try {
        const { data: { text } } = await worker.recognize(file);
        const parsed = parseTicketText(text);
        if (parsed.mode) setMode(parsed.mode);
        if (parsed.carrier) setCarrier(parsed.carrier);
        if (parsed.carrierCode) setCarrierCode(parsed.carrierCode);
        if (parsed.number) setNumber(parsed.number);
        if (parsed.origin) setOrigin(parsed.origin);
        if (parsed.destination) setDestination(parsed.destination);
        if (parsed.dayDate) setDayDate(parsed.dayDate);
        if (parsed.departureTime) setDepartureTime(parsed.departureTime);
        if (parsed.arrivalTime) setArrivalTime(parsed.arrivalTime);
        if (parsed.station) setStation(parsed.station);
      } finally {
        await worker.terminate();
      }
    } catch {
      setScanError("Couldn’t read the ticket. You can still enter the details manually.");
    } finally {
      setScanning(false);
      setScanProgress(0);
    }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    try {
      const draft = {
        tripId,
        mode,
        dayDate,
        carrier,
        carrierCode: carrierCode || null,
        number,
        origin: origin || null,
        destination: destination || null,
        scheduledDeparture: `${dayDate}T${departureTime}:00`,
        scheduledArrival: arrivalTime ? `${dayDate}T${arrivalTime}:00` : null,
        gate: mode === "flight" && station ? station : null,
        platform: mode === "train" && station ? station : null,
        ticketImage,
        ticketImageName,
        createdBy: userId,
      };
      if (segment) {
        await transitRepository.update(segment.id, {
          mode,
          dayDate,
          carrier,
          carrierCode: carrierCode || null,
          number,
          origin: origin || null,
          destination: destination || null,
          scheduledDeparture: `${dayDate}T${departureTime}:00`,
          scheduledArrival: arrivalTime ? `${dayDate}T${arrivalTime}:00` : null,
          gate: mode === "flight" && station ? station : null,
          platform: mode === "train" && station ? station : null,
          ticketImage,
          ticketImageName,
        });
      } else {
        await transitRepository.create(draft);
      }
      onOpenChange(false);
      reset();
    } catch (cause) {
      onError?.(cause instanceof Error ? cause.message : "Unable to add transit.");
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setCarrier("");
    setCarrierCode("");
    setNumber("");
    setOrigin("");
    setDestination("");
    setDepartureTime("");
    setArrivalTime("");
    setStation("");
    setTicketImage(null);
    setTicketImageName(null);
    setScanError(null);
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && !saving && onOpenChange(false)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{segment ? "Edit transit" : "Add transit"}</DialogTitle>
          <DialogDescription>
            {segment ? "Update this flight or train leg." : "Track a flight or train leg so its status shows up in your itinerary."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="rounded-xl border bg-muted/30 p-3">
            <Label>Scan your ticket</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Take a photo or upload your boarding pass / ticket. We’ll read it on your device and fill in the details below for review.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" onClick={() => cameraRef.current?.click()} disabled={scanning}>
                <Camera className="size-4" />Take photo
              </Button>
              <Button type="button" variant="outline" onClick={() => uploadRef.current?.click()} disabled={scanning}>
                <ImageUp className="size-4" />Upload image
              </Button>
            </div>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(event) => { void handleTicketImage(event.target.files?.[0] ?? null); event.target.value = ""; }} />
            <input ref={uploadRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => { void handleTicketImage(event.target.files?.[0] ?? null); event.target.value = ""; }} />
            {scanning && (
              <div className="mt-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />Reading ticket… {scanProgress}%
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${scanProgress}%` }} />
                </div>
              </div>
            )}
            {scanError && <p className="mt-2 text-xs text-destructive">{scanError}</p>}
            {ticketPreview && (
              <div className="mt-3 flex items-center gap-3 rounded-lg border bg-background p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ticketPreview} alt={ticketImageName ?? "Ticket preview"} className="h-16 w-16 rounded object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{ticketImageName ?? "Ticket"}</p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground"><ScanText className="size-3.5" />Saved with this leg, offline</p>
                </div>
                {!scanning && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => { setTicketImage(null); setTicketImageName(null); }}>Remove</Button>
                )}
              </div>
            )}
          </div>

          <div>
            <Label>Type</Label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <ModeButton active={mode === "flight"} onClick={() => setMode("flight")} icon={Plane} label="Flight" />
              <ModeButton active={mode === "train"} onClick={() => setMode("train")} icon={TrainFront} label="Train" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Carrier" value={carrier} onChange={setCarrier} placeholder={mode === "flight" ? "e.g. Delta" : "e.g. Amtrak"} required />
            <Field label={mode === "flight" ? "Flight no." : "Train no."} value={number} onChange={setNumber} placeholder="e.g. 1284" required />
          </div>
          <Field label="Carrier code (optional)" value={carrierCode} onChange={setCarrierCode} placeholder={mode === "flight" ? "e.g. DL" : "e.g. AM"} />

          <div className="grid grid-cols-2 gap-3">
            <Field label="From" value={origin} onChange={setOrigin} placeholder="e.g. JFK" />
            <Field label="To" value={destination} onChange={setDestination} placeholder="e.g. CDG" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="transit-day">Day</Label>
              <Input id="transit-day" type="date" value={dayDate} onChange={(event) => setDayDate(event.target.value)} required />
            </div>
            <Field label="Departure time" type="time" value={departureTime} onChange={setDepartureTime} required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Arrival time (optional)" type="time" value={arrivalTime} onChange={setArrivalTime} />
            <Field
              label={mode === "flight" ? "Gate / terminal (optional)" : "Platform (optional)"}
              value={station}
              onChange={setStation}
              placeholder={mode === "flight" ? "e.g. B12" : "e.g. 9"}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={saving || !canSubmit}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : segment ? <Save className="size-4" /> : <Plus className="size-4" />}
              {segment ? "Save changes" : "Add transit"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ModeButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Plane;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "border-primary bg-primary/10 text-primary" : "hover:border-primary/40 hover:bg-primary/5"
      )}
    >
      <Icon className="size-4" aria-hidden /> {label}
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "onChange" | "value" | "id"> & {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = `transit-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        {...props}
      />
    </div>
  );
}
