"use client";

import { Loader2, Plane, Plus, TrainFront } from "lucide-react";
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
import { transitRepository } from "@/features/transit/data/dexie-transit-repository";
import type { TransitMode } from "@/features/transit/domain/transit-types";
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  userId: string;
  /** ISO date (`yyyy-mm-dd`) to prefill. */
  defaultDay: string;
  onError?: (message: string) => void;
}) {
  const [mode, setMode] = useState<TransitMode>("flight");
  const [carrier, setCarrier] = useState("");
  const [carrierCode, setCarrierCode] = useState("");
  const [number, setNumber] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [dayDate, setDayDate] = useState(defaultDay);
  const [departureTime, setDepartureTime] = useState("");
  const [arrivalTime, setArrivalTime] = useState("");
  const [station, setStation] = useState("");
  const [saving, setSaving] = useState(false);

  const canSubmit =
    carrier.trim().length > 0 &&
    number.trim().length > 0 &&
    dayDate &&
    departureTime.length > 0;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    try {
      const segment = {
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
        createdBy: userId,
      };
      await transitRepository.create(segment);
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
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && !saving && onOpenChange(false)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add transit</DialogTitle>
          <DialogDescription>
            Track a flight or train leg so its status shows up in your itinerary.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
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
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Add transit
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
