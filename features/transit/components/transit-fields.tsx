"use client";

import { Camera, ImageUp, Loader2, Plane, ScanText, TicketCheck, TrainFront } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TransitMode, TransitSegment } from "@/features/transit/domain/transit-types";
import { parseTicketText } from "@/features/transit/lib/ticket-parser";
import { cn } from "@/lib/utils";

export interface TransitFormValues {
  mode: TransitMode;
  dayDate: string;
  carrier: string;
  carrierCode: string | null;
  number: string;
  origin: string | null;
  destination: string | null;
  scheduledDeparture: string;
  scheduledArrival: string | null;
  gate: string | null;
  platform: string | null;
  ticketImage: Blob | null;
  ticketImageName: string | null;
  bookingReference: string | null;
}

export function TransitFields({
  defaultDay,
  onTicketChange,
  segment,
}: {
  defaultDay: string;
  onTicketChange: (ticketImage: Blob | null) => void;
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
  const [arrivalTimeEdited, setArrivalTimeEdited] = useState(Boolean(segment?.scheduledArrival));
  const [station, setStation] = useState(segment ? (segment.mode === "flight" ? segment.gate ?? segment.terminal ?? "" : segment.platform ?? "") : "");
  const [ticketImage, setTicketImage] = useState<Blob | null>(segment?.ticketImage ?? null);
  const [ticketImageName, setTicketImageName] = useState<string | null>(segment?.ticketImageName ?? null);
  const [bookingEnabled, setBookingEnabled] = useState(Boolean(segment?.bookingReference));
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanError, setScanError] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const ticketPreview = useMemo(
    () => (ticketImage ? URL.createObjectURL(ticketImage) : null),
    [ticketImage]
  );

  useEffect(
    () => () => {
      if (ticketPreview) URL.revokeObjectURL(ticketPreview);
    },
    [ticketPreview]
  );

  async function handleTicketImage(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setScanError("Choose an image file.");
      return;
    }
    setTicketImage(file);
    onTicketChange(file);
    setTicketImageName(file.name);
    setScanError(null);
    setScanning(true);
    setScanProgress(0);
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng", 1, {
        logger: (message) => {
          if (message.status === "recognizing text") {
            setScanProgress(Math.round(message.progress * 100));
          }
        },
      });
      try {
        const { data } = await worker.recognize(file);
        const parsed = parseTicketText(data.text);
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
  }

  return (
    <div className="space-y-4">
      <input type="hidden" name="transitMode" value={mode} />
      <input type="hidden" name="ticketImageName" value={ticketImageName ?? ""} />
      {ticketImage && <input type="hidden" name="hasTicketImage" value="true" />}
      <div className="rounded-xl border bg-muted/30 p-3">
        <Label>Scan your ticket</Label>
        <p className="mt-1 text-xs text-muted-foreground">
          Take a photo or upload your boarding pass or ticket to fill in the details locally.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" onClick={() => cameraRef.current?.click()} disabled={scanning}>
            <Camera aria-hidden />Take photo
          </Button>
          <Button type="button" variant="outline" onClick={() => uploadRef.current?.click()} disabled={scanning}>
            <ImageUp aria-hidden />Upload image
          </Button>
        </div>
        <input ref={cameraRef} name="ticketCamera" type="file" accept="image/*" capture="environment" className="sr-only" onChange={(event) => { void handleTicketImage(event.target.files?.[0] ?? null); event.target.value = ""; }} />
        <input ref={uploadRef} name="ticketUpload" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => { void handleTicketImage(event.target.files?.[0] ?? null); event.target.value = ""; }} />
        {scanning && <div className="mt-3"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" aria-hidden />Reading ticket... {scanProgress}%</div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${scanProgress}%` }} /></div></div>}
        {scanError && <p className="mt-2 text-xs text-destructive">{scanError}</p>}
        {ticketPreview && <div className="mt-3 flex items-center gap-3 rounded-lg border bg-background p-2"><Image src={ticketPreview} alt={ticketImageName ?? "Ticket preview"} width={64} height={64} unoptimized className="h-16 w-16 rounded object-cover" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{ticketImageName ?? "Ticket"}</p><p className="flex items-center gap-1 text-xs text-muted-foreground"><ScanText className="size-3.5" aria-hidden />Saved with this leg, offline</p></div><Button type="button" variant="ghost" size="sm" disabled={scanning} onClick={() => { setTicketImage(null); setTicketImageName(null); onTicketChange(null); }}>Remove</Button></div>}
      </div>

      <div>
        <Label>Type</Label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <ModeButton active={mode === "flight"} onClick={() => setMode("flight")} icon={Plane} label="Flight" />
          <ModeButton active={mode === "train"} onClick={() => setMode("train")} icon={TrainFront} label="Train" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <TransitField name="carrier" label="Carrier" value={carrier} onChange={setCarrier} placeholder={mode === "flight" ? "e.g. Delta" : "e.g. Amtrak"} required />
        <TransitField name="transitNumber" label={mode === "flight" ? "Flight no." : "Train no."} value={number} onChange={setNumber} placeholder="e.g. 1284" required />
      </div>
      <TransitField name="carrierCode" label="Carrier code (optional)" value={carrierCode} onChange={setCarrierCode} placeholder={mode === "flight" ? "e.g. DL" : "e.g. AM"} />
      <div className="grid grid-cols-2 gap-3">
        <TransitField name="origin" label="From" value={origin} onChange={setOrigin} placeholder="e.g. JFK" />
        <TransitField name="destination" label="To" value={destination} onChange={setDestination} placeholder="e.g. CDG" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TransitField name="transitDayDate" label="Day" type="date" value={dayDate} onChange={setDayDate} required />
        <TransitField name="departureTime" label="Departure time" type="time" value={departureTime} onChange={(value) => { setDepartureTime(value); if (!arrivalTimeEdited) setArrivalTime(value ? addMinutes(value, 180) : ""); }} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TransitField name="arrivalTime" label="Arrival time (optional)" type="time" value={arrivalTime} onChange={(value) => { setArrivalTime(value); setArrivalTimeEdited(Boolean(value)); }} />
        <TransitField name="station" label={mode === "flight" ? "Gate / terminal (optional)" : "Platform (optional)"} value={station} onChange={setStation} placeholder={mode === "flight" ? "e.g. B12" : "e.g. 9"} />
      </div>
      <div className="space-y-2">
        <button type="button" aria-pressed={bookingEnabled} className="flex w-full items-center justify-between rounded-xl border p-3 text-left" onClick={() => setBookingEnabled((enabled) => !enabled)}>
          <span><span className="block text-sm font-semibold">Booking</span><span className="block text-xs text-muted-foreground">Add a confirmation code</span></span>
          <span className={`relative h-6 w-11 rounded-full transition-colors ${bookingEnabled ? "bg-primary" : "bg-muted"}`}><span className={`absolute top-1 size-4 rounded-full bg-background shadow-sm transition-transform ${bookingEnabled ? "translate-x-6" : "translate-x-1"}`} /></span>
        </button>
        {bookingEnabled && <div className="relative"><TicketCheck className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input aria-label="Booking Reference / Confirmation Code" name="bookingReference" defaultValue={segment?.bookingReference ?? ""} autoCapitalize="characters" autoComplete="off" className="pl-9 font-mono uppercase" /></div>}
      </div>
    </div>
  );
}

export function getTransitFormValues(form: HTMLFormElement, ticketImage: Blob | null = null): TransitFormValues {
  const data = new FormData(form);
  const mode = String(data.get("transitMode")) as TransitMode;
  const dayDate = String(data.get("transitDayDate"));
  const departureTime = String(data.get("departureTime"));
  const arrivalTime = String(data.get("arrivalTime") || "");
  const station = String(data.get("station") || "") || null;
  return {
    mode,
    dayDate,
    carrier: String(data.get("carrier")),
    carrierCode: String(data.get("carrierCode") || "") || null,
    number: String(data.get("transitNumber")),
    origin: String(data.get("origin") || "") || null,
    destination: String(data.get("destination") || "") || null,
    scheduledDeparture: `${dayDate}T${departureTime}:00`,
    scheduledArrival: arrivalTime ? `${dayDate}T${arrivalTime}:00` : null,
    gate: mode === "flight" ? station : null,
    platform: mode === "train" ? station : null,
    ticketImage,
    ticketImageName: String(data.get("ticketImageName") || "") || null,
    bookingReference: String(data.get("bookingReference") || "").trim() || null,
  };
}

function ModeButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof Plane; label: string }) {
  return <button type="button" onClick={onClick} aria-pressed={active} className={cn("flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active ? "border-primary bg-primary/10 text-primary" : "hover:border-primary/40 hover:bg-primary/5")}><Icon className="size-4" aria-hidden />{label}</button>;
}

function TransitField({ name, label, value, onChange, ...props }: Omit<React.ComponentProps<typeof Input>, "name" | "onChange" | "value" | "id"> & { name: string; label: string; value: string; onChange: (value: string) => void }) {
  const id = `transit-${name}`;
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><Input id={id} name={name} value={value} onChange={(event) => onChange(event.target.value)} {...props} /></div>;
}

function addMinutes(time: string, minutesToAdd: number): string {
  const [hours, minutes] = time.split(":").map(Number);
  const total = (hours * 60 + minutes + minutesToAdd) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
