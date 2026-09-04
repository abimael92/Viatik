"use client";

import { MapPin } from "lucide-react";
import { useEffect, useState } from "react";

import { getPlaceDetails, searchDestinations, type PlaceDetails, type PlaceSuggestion } from "@/app/actions/places";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function DestinationField({
  value: controlledValue,
  onChange,
  onPlaceSelect,
  defaultValue = "",
  error,
}: {
  value?: string;
  onChange?: (value: string) => void;
  onPlaceSelect?: (details: PlaceDetails) => void;
  defaultValue?: string;
  error?: string;
}) {
  const isControlled = controlledValue !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue);
  const value = isControlled ? controlledValue : internalValue;
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [configured, setConfigured] = useState(true);
  const [pendingPlaceId, setPendingPlaceId] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      if (value.trim().length < 2) {
        setSuggestions([]);
        return;
      }
      const result = await searchDestinations(value);
      setConfigured(result.configured);
      setSuggestions(result.suggestions);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [value]);

  function setValue(next: string) {
    if (!isControlled) setInternalValue(next);
    onChange?.(next);
  }

  async function handleSelect(suggestion: PlaceSuggestion) {
    setValue(suggestion.label);
    setSuggestions([]);
    if (onPlaceSelect) {
      setPendingPlaceId(suggestion.placeId);
      const details = await getPlaceDetails(suggestion.placeId, suggestion.label);
      if (details) onPlaceSelect(details);
      setPendingPlaceId(null);
    }
  }

  return (
    <div className="relative space-y-2">
      <Label htmlFor="destination">Destination</Label>
      {!error && (
        <p id="destination-help" className="text-xs text-muted-foreground">
          {configured
            ? "Search cities with Google Places, or enter any destination."
            : "Enter a destination. Google Places will activate after its API key is configured."}
        </p>
      )}
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="destination"
          name="destination"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Tokyo, Japan"
          maxLength={120}
          autoComplete="off"
          disabled={pendingPlaceId !== null}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "destination-error" : "destination-help"}
          className={cn(
            "pl-9",
            error ? "border-destructive focus-visible:ring-destructive/50" : ""
          )}
        />
      </div>
      {suggestions.length > 0 && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border bg-popover shadow-lg">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.placeId}
              type="button"
              disabled={pendingPlaceId === suggestion.placeId}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted disabled:opacity-60"
              onClick={() => handleSelect(suggestion)}
            >
              <MapPin className="size-4 text-primary" />
              {suggestion.label}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p id="destination-error" role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
