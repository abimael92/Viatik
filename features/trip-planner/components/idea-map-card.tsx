"use client";

import { ExternalLink, LoaderCircle, MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { cn } from "@/lib/utils";

export type IdeaMapCoordinates = { latitude: number; longitude: number };

function isValidCoordinate(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

/** OpenStreetMap's keyless embed: a bbox plus a marker, no API key, no SDK. */
export function osmEmbedUrl({ latitude, longitude }: IdeaMapCoordinates): string {
  const latSpan = 0.14;
  const lonSpan = 0.2;
  const bbox = [
    longitude - lonSpan,
    latitude - latSpan,
    longitude + lonSpan,
    latitude + latSpan,
  ]
    .map((value) => value.toFixed(4))
    .join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latitude.toFixed(5)},${longitude.toFixed(5)}`;
}

export function osmPlaceUrl(destination: string, coordinates?: IdeaMapCoordinates): string {
  if (coordinates) {
    const lat = coordinates.latitude.toFixed(5);
    const lon = coordinates.longitude.toFixed(5);
    return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=11/${lat}/${lon}`;
  }
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(destination)}`;
}

function useIsOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return online;
}

/**
 * Where the destination is. Renders the OpenStreetMap embed when the device is
 * online and the coordinates are known, and always degrades to a static tile
 * with an external link — the card must render with no network round-trip.
 */
export function IdeaMapCard({
  destination,
  latitude,
  longitude,
  onResolveLocation,
  autoResolve = false,
  className,
}: {
  destination: string;
  latitude: number | null;
  longitude: number | null;
  /** Resolves and persists coordinates; returns them when it succeeds. */
  onResolveLocation?: () => Promise<IdeaMapCoordinates | null>;
  /** Try once on mount when coordinates are missing and the device is online. */
  autoResolve?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const online = useIsOnline();
  const [resolved, setResolved] = useState<IdeaMapCoordinates | null>(null);
  const [resolving, setResolving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const autoStarted = useRef(false);

  const fromProps =
    latitude != null && longitude != null && isValidCoordinate(latitude, longitude)
      ? { latitude, longitude }
      : null;
  const coordinates = fromProps ?? resolved;

  useEffect(() => {
    if (!autoResolve || coordinates || !online || !onResolveLocation) return;
    if (autoStarted.current) return;
    autoStarted.current = true;
    let active = true;
    void onResolveLocation()
      .then((next) => {
        if (active && next) setResolved(next);
        if (active && !next) setFailed(true);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
    // `coordinates` is intentionally not a dependency: resolving it re-triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoResolve, online, onResolveLocation, Boolean(coordinates)]);

  async function locate() {
    if (!onResolveLocation || resolving) return;
    setFailed(false);
    setResolving(true);
    try {
      const next = await onResolveLocation();
      if (next) setResolved(next);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setResolving(false);
    }
  }

  const showMap = Boolean(coordinates) && online && !mapFailed;
  const coordinateLabel = coordinates
    ? t("copy.tripIdeaMapCoordinates", {
        lat: coordinates.latitude.toFixed(3),
        lon: coordinates.longitude.toFixed(3),
      })
    : null;

  if (showMap && coordinates) {
    return (
      <div
        className={cn(
          "overflow-hidden rounded-xl border border-border/60 bg-muted/20",
          className
        )}
      >
        <iframe
          title={t("copy.tripIdeaMapTitle", { destination })}
          src={osmEmbedUrl(coordinates)}
          className="h-44 w-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setMapFailed(true)}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-3 py-2">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
            <MapPin aria-hidden className="size-3.5" />
            {coordinateLabel}
          </p>
          <Button asChild variant="ghost" size="sm">
            <a
              href={osmPlaceUrl(destination, coordinates)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink aria-hidden />
              {t("copy.tripIdeaMapOpen")}
            </a>
          </Button>
        </div>
      </div>
    );
  }

  const status = !coordinates
    ? resolving
      ? t("copy.tripIdeaMapLocating")
      : failed
        ? t("copy.tripIdeaMapLocateFailed")
        : t("copy.tripIdeaMapNoCoordinates")
    : !online
      ? t("copy.tripIdeaMapOffline")
      : t("copy.tripIdeaMapFailed");

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-muted/20 p-3",
        className
      )}
    >
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-lg bg-viatik-blue/10 text-viatik-blue"
      >
        <MapPin className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{t("copy.tripIdeaMapHeading")}</p>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {coordinateLabel ? `${coordinateLabel} · ${status}` : status}
        </p>
      </div>
      <div className="flex items-center gap-1">
        {onResolveLocation && !coordinates && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={resolving || !online}
            onClick={() => void locate()}
          >
            {resolving ? (
              <LoaderCircle aria-hidden className="animate-spin" />
            ) : (
              <MapPin aria-hidden />
            )}
            {resolving ? t("copy.tripIdeaMapLocating") : t("copy.tripIdeaMapLocate")}
          </Button>
        )}
        <Button asChild variant="ghost" size="sm">
          <a href={osmPlaceUrl(destination, coordinates ?? undefined)} target="_blank" rel="noopener noreferrer">
            <ExternalLink aria-hidden />
            {t("copy.tripIdeaMapOpen")}
          </a>
        </Button>
      </div>
    </div>
  );
}
