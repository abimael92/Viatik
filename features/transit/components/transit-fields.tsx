"use client";

import { Camera, ImageUp, Loader2, ScanText } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TransitMode, TransitSegment } from "@/features/transit/domain/transit-types";
import { parseTicketText } from "@/features/transit/lib/ticket-parser";
import { useI18n } from "@/lib/i18n/i18n-provider";

const TRANSIT_MODE_OPTIONS: Array<{ value: TransitMode; label: string }> = [
  { value: "flight", label: "Plane" },
  { value: "train", label: "Train" },
  { value: "car", label: "Car" },
  { value: "carpool", label: "Carpool" },
  { value: "taxi", label: "Taxi" },
  { value: "rideshare", label: "Uber / rideshare" },
  { value: "bus", label: "Bus" },
  { value: "ship", label: "Ship" },
  { value: "ferry", label: "Ferry" },
  { value: "bike", label: "Bike" },
  { value: "walk", label: "Walk" },
];

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
  const { t } = useI18n();
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

  const selectedMode = TRANSIT_MODE_OPTIONS.find((option) => option.value === mode)?.label ?? mode;
  const ticketMode = mode === "flight" || mode === "train" || mode === "ship" || mode === "ferry";
  const arrivalDuration = durationBetween(departureTime, arrivalTime);

  return (
    <div className="space-y-4">
      <input type="hidden" name="transitMode" value={mode} />
      <input type="hidden" name="ticketImageName" value={ticketImageName ?? ""} />
      {ticketImage && <input type="hidden" name="hasTicketImage" value="true" />}
      {ticketMode && (
      <div className="rounded-xl border bg-muted/30 p-3">
        <Label>{t("copy.scanTicket")}</Label>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("copy.scanTicketHelp")}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" onClick={() => cameraRef.current?.click()} disabled={scanning}>
            <Camera aria-hidden />{t("copy.takePhoto")}
          </Button>
          <Button type="button" variant="outline" onClick={() => uploadRef.current?.click()} disabled={scanning}>
            <ImageUp aria-hidden />{t("copy.uploadImage")}
          </Button>
        </div>
        <input ref={cameraRef} name="ticketCamera" type="file" accept="image/*" capture="environment" className="sr-only" onChange={(event) => { void handleTicketImage(event.target.files?.[0] ?? null); event.target.value = ""; }} />
        <input ref={uploadRef} name="ticketUpload" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => { void handleTicketImage(event.target.files?.[0] ?? null); event.target.value = ""; }} />
        {scanning && <div className="mt-3"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" aria-hidden />Reading ticket... {scanProgress}%</div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${scanProgress}%` }} /></div></div>}
        {scanError && <p className="mt-2 text-xs text-destructive">{scanError}</p>}
        {ticketPreview && <div className="mt-3 flex items-center gap-3 rounded-lg border bg-background p-2"><Image src={ticketPreview} alt={ticketImageName ?? "Ticket preview"} width={64} height={64} unoptimized className="h-16 w-16 rounded object-cover" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{ticketImageName ?? "Ticket"}</p><p className="flex items-center gap-1 text-xs text-muted-foreground"><ScanText className="size-3.5" aria-hidden />{t("copy.savedWithLeg")}</p></div><Button type="button" variant="ghost" size="sm" disabled={scanning} onClick={() => { setTicketImage(null); setTicketImageName(null); onTicketChange(null); }}>{t("copy.remove")}</Button></div>}
      </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="transit-mode">{t("copy.travelMode")}</Label>
        <select id="transit-mode" value={mode} onChange={(event) => setMode(event.target.value as TransitMode)} className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
          {TRANSIT_MODE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <p className="text-xs text-muted-foreground">{t("copy.scheduleJourney")}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <TransitField name="carrier" label={ticketMode ? "Carrier / provider" : "Provider (optional)"} value={carrier} onChange={setCarrier} placeholder={selectedMode} required={ticketMode} />
        <TransitField name="transitNumber" label={ticketMode ? "Trip number" : "Vehicle / trip no. (optional)"} value={number} onChange={setNumber} placeholder={ticketMode ? "e.g. 1284" : "Optional"} required={ticketMode} />
      </div>
      {ticketMode && <TransitField name="carrierCode" label={t("copy.carrierCodeOptional")} value={carrierCode} onChange={setCarrierCode} placeholder={mode === "flight" ? "e.g. DL" : "e.g. AM"} />}
      <div className="grid grid-cols-2 gap-3">
        <TransitField name="origin" label={t("copy.from")} value={origin} onChange={setOrigin} placeholder={t("copy.placeholderJfk")} />
        <TransitField name="destination" label="To" value={destination} onChange={setDestination} placeholder={t("copy.placeholderCdg")} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TransitField name="transitDayDate" label={t("common.day")} type="date" value={dayDate} onChange={setDayDate} required />
        <TransitField name="departureTime" label={t("copy.departureTime")} type="time" value={departureTime} onChange={(value) => { setDepartureTime(value); if (!arrivalTimeEdited) setArrivalTime(value ? addMinutes(value, 180) : ""); }} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TransitField name="arrivalTime" label={t("copy.arrivalTimeOptional")} type="time" value={arrivalTime} onChange={(value) => { setArrivalTime(value); setArrivalTimeEdited(Boolean(value)); }} />
        {(ticketMode || mode === "bus") && <TransitField name="station" label={mode === "flight" ? "Gate / terminal (optional)" : mode === "train" ? "Platform (optional)" : "Terminal / dock (optional)"} value={station} onChange={setStation} placeholder={mode === "flight" ? "e.g. B12" : mode === "train" ? "e.g. 9" : "Optional"} />}
      </div>
      {arrivalDuration !== null && <p className="rounded-lg bg-primary/5 px-3 py-2 text-sm text-muted-foreground"><span className="font-semibold text-foreground">{t("copy.estimatedTravel")}</span> {formatDuration(arrivalDuration)}</p>}
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

function TransitField({ name, label, value, onChange, ...props }: Omit<React.ComponentProps<typeof Input>, "name" | "onChange" | "value" | "id"> & { name: string; label: string; value: string; onChange: (value: string) => void }) {
  const id = `transit-${name}`;
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><Input id={id} name={name} value={value} onChange={(event) => onChange(event.target.value)} {...props} /></div>;
}

function addMinutes(time: string, minutesToAdd: number): string {
  const [hours, minutes] = time.split(":").map(Number);
  const total = (hours * 60 + minutes + minutesToAdd) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function durationBetween(departure: string, arrival: string): number | null {
  if (!departure || !arrival) return null;
  const [departureHours, departureMinutes] = departure.split(":").map(Number);
  const [arrivalHours, arrivalMinutes] = arrival.split(":").map(Number);
  let duration = arrivalHours * 60 + arrivalMinutes - (departureHours * 60 + departureMinutes);
  if (duration <= 0) duration += 24 * 60;
  return duration;
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return [hours ? `${hours}h` : "", remainder ? `${remainder}m` : ""].filter(Boolean).join(" ");
}
