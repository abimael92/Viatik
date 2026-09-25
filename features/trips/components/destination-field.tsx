"use client";

import { MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { getPlaceDetails, searchDestinations, type PlaceDetails, type PlaceSuggestion } from "@/app/actions/places";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/i18n-provider";

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
  const { t } = useI18n();
  const isControlled = controlledValue !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue);
  const value = isControlled ? controlledValue : internalValue;
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [selectedPlaceLabel, setSelectedPlaceLabel] = useState<string | null>(controlledValue ?? null);
  const [configured, setConfigured] = useState(true);
  const [pendingPlaceId, setPendingPlaceId] = useState<string | null>(null);
  const searchVersion = useRef(0);

  useEffect(() => {
    const version = ++searchVersion.current;
    const timer = window.setTimeout(async () => {
      if (value.trim().length < 2 || value === selectedPlaceLabel) {
        setSuggestions([]);
        return;
      }
      const result = await searchDestinations(value);
      if (version !== searchVersion.current) return;
      setConfigured(result.configured);
      setSuggestions(result.suggestions);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [value, selectedPlaceLabel]);

  function setValue(next: string, selected = false) {
    if (!selected) setSelectedPlaceLabel(null);
    if (!isControlled) setInternalValue(next);
    onChange?.(next);
  }

  async function handleSelect(suggestion: PlaceSuggestion) {
    searchVersion.current += 1;
    setSelectedPlaceLabel(suggestion.label);
    setValue(suggestion.label, true);
    setSuggestions([]);
    if (onPlaceSelect) {
      setPendingPlaceId(suggestion.placeId);
      try {
        const details = await getPlaceDetails(suggestion.placeId, suggestion.label);
        if (details) onPlaceSelect(details);
      } finally {
        // Always re-enable the input, even if the details lookup throws, so the
        // user is never stuck with a disabled field.
        setPendingPlaceId(null);
      }
    }
  }

  return (
    <div className="relative space-y-2">
      <Label htmlFor="destination">{t("copy.destination")}</Label>
      {!error && (
        <p id="destination-help" className="text-xs text-muted-foreground">
          {configured
            ? "Search for a city and select a result to set its weather location."
            : "Location search is temporarily unavailable."}
        </p>
      )}
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="destination"
          name="destination"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={t("copy.placeholderTokyo")}
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
              <MapPin className="size-5 text-primary" />
              {suggestion.label}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p id="destination-error" role="alert" className="text-xs font-semibold text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
