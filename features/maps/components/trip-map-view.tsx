"use client";

import { BedDouble, Landmark, LocateFixed, MapPin, Minus, NotebookPen, Plus, TrainFront, Trash2, Utensils } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { activityRepository } from "@/features/activities/data/dexie-activity-repository";
import { pinRepository } from "@/features/maps/data/dexie-pin-repository";
import type { TripPin, TripPinCategory } from "@/features/maps/domain/map-types";
import {
  autoZoomForBounds,
  clampZoom,
  computeBounds,
  formatDistance,
  getBoundsCenter,
  haversineDistanceMeters,
  inverseMercatorY,
  projectToWorld,
  TILE_SIZE,
  type GeoPoint,
} from "@/features/maps/lib/geo-utils";
import type { Activity, Trip } from "@/features/domain/entities";
import { isAccommodationCategory } from "@/features/maps/domain/map-types";
import { cn } from "@/lib/utils";

type MarkerKind = "activity" | "accommodation" | "pin";

interface MapMarker {
  key: string;
  kind: MarkerKind;
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  subtitle: string | null;
  description: string | null;
  category: string;
}

interface MarkerStyle {
  container: string;
  dot: string;
  icon: typeof MapPin;
}

const MARKER_STYLES: Record<MarkerKind, MarkerStyle> = {
  activity: { container: "bg-blue-500 text-white", dot: "bg-blue-500", icon: MapPin },
  accommodation: { container: "bg-amber-500 text-white", dot: "bg-amber-500", icon: BedDouble },
  pin: { container: "bg-fuchsia-600 text-white", dot: "bg-fuchsia-600", icon: MapPin },
};

const PIN_STYLES: Record<TripPinCategory, MarkerStyle> = {
  place: { container: "bg-emerald-500 text-white", dot: "bg-emerald-500", icon: Landmark },
  food: { container: "bg-orange-500 text-white", dot: "bg-orange-500", icon: Utensils },
  lodging: { container: "bg-amber-500 text-white", dot: "bg-amber-500", icon: BedDouble },
  transport: { container: "bg-sky-500 text-white", dot: "bg-sky-500", icon: TrainFront },
  note: { container: "bg-slate-500 text-white", dot: "bg-slate-500", icon: NotebookPen },
};

const PIN_CATEGORY_LABELS: Record<TripPinCategory, string> = {
  place: "Place",
  food: "Food",
  lodging: "Lodging",
  transport: "Transport",
  note: "Note",
};

function markerStyle(kind: MarkerKind, category: string): MarkerStyle {
  if (kind === "pin") return PIN_STYLES[category as TripPinCategory] ?? PIN_STYLES.note;
  return MARKER_STYLES[kind];
}

function formatLatLng(point: GeoPoint): string {
  return `${point.latitude.toFixed(4)}, ${point.longitude.toFixed(4)}`;
}

export function TripMapView({
  tripId,
  userId,
  trip,
  canEdit,
}: {
  tripId: string;
  userId: string;
  trip: Trip;
  canEdit: boolean;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);

  const [activities, setActivities] = useState<Activity[]>([]);
  const [pins, setPins] = useState<TripPin[]>([]);
  const [viewport, setViewport] = useState<{ width: number; height: number }>({ width: 800, height: 480 });

  const [center, setCenter] = useState<GeoPoint>({ latitude: 0, longitude: 0 });
  const [zoom, setZoom] = useState(3);
  const [selected, setSelected] = useState<MapMarker | null>(null);
  const [pinMode, setPinMode] = useState(false);
  const [dropPoint, setDropPoint] = useState<{ latitude: number; longitude: number } | null>(null);
  const [pinTitle, setPinTitle] = useState("");
  const [pinCategory, setPinCategory] = useState<TripPinCategory>("place");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fittedRef = useRef(false);

  useEffect(() => activityRepository.watchByTrip(tripId, setActivities), [tripId]);
  useEffect(() => pinRepository.watchByTrip(tripId, setPins), [tripId]);

  const markers = useMemo<MapMarker[]>(() => {
    const activityMarkers: MapMarker[] = activities
      .filter((activity) => activity.latitude != null && activity.longitude != null)
      .map((activity) => ({
        key: `activity-${activity.id}`,
        kind: isAccommodationCategory(activity.category) ? "accommodation" : "activity",
        id: activity.id,
        latitude: activity.latitude as number,
        longitude: activity.longitude as number,
        title: activity.title,
        subtitle: activity.location ?? null,
        description: activity.description ?? null,
        category: activity.category,
      }));
    const pinMarkers: MapMarker[] = pins.map((pin) => ({
      key: `pin-${pin.id}`,
      kind: "pin",
      id: pin.id,
      latitude: pin.latitude,
      longitude: pin.longitude,
      title: pin.title,
      subtitle: PIN_CATEGORY_LABELS[pin.category] ?? pin.category,
      description: pin.description ?? null,
      category: pin.category,
    }));
    return [...activityMarkers, ...pinMarkers];
  }, [activities, pins]);

  // Measure the surface so auto-zoom can fit markers exactly.
  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setViewport({ width: rect.width, height: rect.height });
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const fitToMarkers = useCallback(() => {
    const points: GeoPoint[] = markers.map((marker) => ({ latitude: marker.latitude, longitude: marker.longitude }));
    const tripPoint: GeoPoint | null =
      trip.latitude != null && trip.longitude != null ? { latitude: trip.latitude, longitude: trip.longitude } : null;
    const source = points.length > 0 ? points : tripPoint ? [tripPoint] : [];
    const bounds = computeBounds(source);
    if (bounds) {
      setCenter(getBoundsCenter(bounds));
      setZoom(autoZoomForBounds(bounds, viewport.width, viewport.height));
    } else {
      setCenter({ latitude: 20, longitude: 0 });
      setZoom(3);
    }
  }, [markers, trip.latitude, trip.longitude, viewport.width, viewport.height]);

  // Auto-fit once markers are known and the surface has been measured.
  useEffect(() => {
    if (fittedRef.current || viewport.width <= 0) return;
    fittedRef.current = true;
    fitToMarkers();
  }, [viewport.width, fitToMarkers]);

  const project = useCallback(
    (latitude: number, longitude: number) => {
      const world = projectToWorld(latitude, longitude, zoom);
      const centerWorld = projectToWorld(center.latitude, center.longitude, zoom);
      return {
        x: world.x - centerWorld.x + viewport.width / 2,
        y: world.y - centerWorld.y + viewport.height / 2,
      };
    },
    [zoom, center, viewport.width, viewport.height]
  );

  const screenToLatLng = useCallback(
    (x: number, y: number): GeoPoint => {
      const worldSize = TILE_SIZE * 2 ** zoom;
      const centerWorld = projectToWorld(center.latitude, center.longitude, zoom);
      const worldX = centerWorld.x + (x - viewport.width / 2);
      const worldY = centerWorld.y + (y - viewport.height / 2);
      return {
        longitude: (worldX / worldSize) * 360 - 180,
        latitude: inverseMercatorY(worldY / worldSize),
      };
    },
    [zoom, center, viewport.width, viewport.height]
  );

  const panByPixels = useCallback(
    (dx: number, dy: number) => {
      const worldSize = TILE_SIZE * 2 ** zoom;
      const centerWorld = projectToWorld(center.latitude, center.longitude, zoom);
      const nextX = centerWorld.x + dx;
      const nextY = centerWorld.y + dy;
      setCenter({
        longitude: (nextX / worldSize) * 360 - 180,
        latitude: inverseMercatorY(nextY / worldSize),
      });
    },
    [zoom, center]
  );

  // --- Pointer interactions: drag to pan + pinch to zoom ---
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const gestureRef = useRef<{ startDistance: number; startCenter: GeoPoint; startZoom: number } | null>(null);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size === 1) {
      gestureRef.current = null;
    } else if (pointersRef.current.size === 2) {
      const [p1, p2] = [...pointersRef.current.values()];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      gestureRef.current = { startDistance: Math.hypot(dx, dy), startCenter: center, startZoom: zoom };
    }
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const previous = pointersRef.current.get(event.pointerId);
    if (!previous) return;
    const current = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, current);

    if (pointersRef.current.size === 1) {
      panByPixels(current.x - previous.x, current.y - previous.y);
    } else if (pointersRef.current.size === 2 && gestureRef.current) {
      const [p1, p2] = [...pointersRef.current.values()];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const distance = Math.hypot(dx, dy);
      const nextZoom = clampZoom(gestureRef.current.startZoom + Math.log2(distance / Math.max(gestureRef.current.startDistance, 1)));
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      setZoom(nextZoom);
      // Keep the pinch midpoint anchored: convert viewport delta to world delta.
      const rect = surfaceRef.current?.getBoundingClientRect();
      if (rect) {
        const localMid = screenToLatLng(midX - rect.left, midY - rect.top);
        setCenter(localMid);
      }
    }
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) gestureRef.current = null;
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return;
    const nextZoom = clampZoom(zoom + (event.deltaY < 0 ? 1 : -1));
    if (nextZoom === zoom) return;
    // Zoom toward the cursor: keep the point under the cursor fixed on screen.
    const cursor = screenToLatLng(event.clientX - rect.left, event.clientY - rect.top);
    const worldSize = TILE_SIZE * 2 ** nextZoom;
    const anchorWorld = projectToWorld(cursor.latitude, cursor.longitude, nextZoom);
    const centerWorld = {
      x: anchorWorld.x - (event.clientX - rect.left - viewport.width / 2),
      y: anchorWorld.y - (event.clientY - rect.top - viewport.height / 2),
    };
    setZoom(nextZoom);
    setCenter({
      longitude: (centerWorld.x / worldSize) * 360 - 180,
      latitude: inverseMercatorY(centerWorld.y / worldSize),
    });
  }

  function handleSurfaceClick(event: React.MouseEvent<HTMLDivElement>) {
    if (!pinMode || !canEdit || selected) return;
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return;
    setDropPoint(screenToLatLng(event.clientX - rect.left, event.clientY - rect.top));
  }

  async function confirmDrop() {
    if (!dropPoint) return;
    const title = pinTitle.trim();
    if (!title) return;
    setSaving(true);
    setError(null);
    try {
      await pinRepository.create({
        id: crypto.randomUUID(),
        tripId,
        title,
        description: null,
        latitude: dropPoint.latitude,
        longitude: dropPoint.longitude,
        category: pinCategory,
        createdBy: userId,
      });
      setDropPoint(null);
      setPinTitle("");
      setPinCategory("place");
      setPinMode(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save pin.");
    } finally {
      setSaving(false);
    }
  }

  async function deletePin(marker: MapMarker) {
    if (marker.kind !== "pin" || !canEdit) return;
    try {
      await pinRepository.remove(marker.id);
      setSelected(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to delete pin.");
    }
  }

  const selectedDistance =
    selected && markers.length > 0
      ? haversineDistanceMeters(
          { latitude: selected.latitude, longitude: selected.longitude },
          { latitude: center.latitude, longitude: center.longitude }
        )
      : null;

  return (
    <section className="space-y-5" aria-label="Trip map">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Map</h2>
          <p className="text-muted-foreground">
            {markers.length === 0
              ? "Plot your itinerary and drop pins to see everything on one offline map."
              : `${markers.length} location${markers.length === 1 ? "" : "s"} plotted — works offline.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <Button variant={pinMode ? "default" : "outline"} onClick={() => setPinMode((value) => !value)}>
              <MapPin className="size-5" />
              {pinMode ? "Cancel pin" : "Drop a pin"}
            </Button>
          )}
          <Button variant="outline" onClick={fitToMarkers}>
            <LocateFixed className="size-5" />Fit all
          </Button>
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

      <div
        ref={surfaceRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={handleWheel}
        onClick={handleSurfaceClick}
        className={cn(
          "relative overflow-hidden rounded-2xl border bg-[radial-gradient(circle_at_center,#1e293b_0%,#0f172a_100%)] select-none",
          pinMode ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"
        )}
        style={{ height: 480, touchAction: "none" }}
      >
        {/* Offline stylized backdrop: subtle grid + compass, no network tiles needed. */}
        <OfflineBackdrop viewport={viewport} />

        {/* Markers */}
        <div className="pointer-events-none absolute inset-0" style={{ width: viewport.width, height: viewport.height }}>
          {markers.map((marker) => {
            const style = markerStyle(marker.kind, marker.category);
            const pos = project(marker.latitude, marker.longitude);
            const isSelected = selected?.key === marker.key;
            return (
              <button
                key={marker.key}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setSelected(isSelected ? null : marker);
                }}
                aria-label={`${marker.title} (${marker.subtitle ?? "location"})`}
                className={cn(
                  "pointer-events-auto absolute -translate-x-1/2 -translate-y-full cursor-pointer rounded-lg p-1 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isSelected && "scale-110 ring-2 ring-ring"
                )}
                style={{ left: pos.x, top: pos.y }}
              >
                <span className={cn("grid size-8 place-items-center rounded-full shadow-lg ring-2 ring-white/70", style.container)}>
                  <style.icon className="size-4" />
                </span>
              </button>
            );
          })}
        </div>

        {/* Pin-mode empty state */}
        {markers.length === 0 && !pinMode && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="max-w-xs rounded-xl bg-slate-900/80 p-5 text-center text-slate-100">
              <MapPin className="mx-auto size-7 text-slate-300" />
              <p className="mt-2 font-semibold">No locations yet</p>
              <p className="mt-1 text-sm text-slate-300">
                Add coordinates to your itinerary or{canEdit ? " drop a pin" : ""} to start plotting on this map.
              </p>
            </div>
          </div>
        )}

        {/* Drop-pin prompt */}
        {dropPoint && (
          <div className="absolute inset-x-0 bottom-4 flex justify-center px-4">
            <div className="w-full max-w-sm rounded-xl border border-border bg-card p-4 shadow-xl">
              <p className="text-sm font-semibold">Drop a pin here</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{formatLatLng(dropPoint)}</p>
              <div className="mt-3 space-y-2">
                <Label htmlFor="pin-title">Label</Label>
                <Input
                  id="pin-title"
                  value={pinTitle}
                  onChange={(event) => setPinTitle(event.target.value)}
                  placeholder="e.g. Sunset viewpoint"
                  autoFocus
                />
                <Label htmlFor="pin-category">Category</Label>
                <select
                  id="pin-category"
                  value={pinCategory}
                  onChange={(event) => setPinCategory(event.target.value as TripPinCategory)}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  {(Object.keys(PIN_CATEGORY_LABELS) as TripPinCategory[]).map((category) => (
                    <option key={category} value={category}>
                      {PIN_CATEGORY_LABELS[category]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setDropPoint(null)}>Cancel</Button>
                <Button type="button" variant="primary" disabled={saving || !pinTitle.trim()} onClick={() => void confirmDrop()}>
                  {saving ? "Saving…" : "Save pin"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="absolute left-3 top-3 flex flex-col gap-1.5 rounded-xl bg-slate-900/85 px-3 py-2 text-xs text-slate-200">
          <LegendRow style={MARKER_STYLES.activity} label="Activity" />
          <LegendRow style={MARKER_STYLES.accommodation} label="Accommodation" />
          <LegendRow style={MARKER_STYLES.pin} label="Dropped pin" />
        </div>

        {/* Zoom controls */}
        <div className="absolute right-3 top-3 flex flex-col gap-1.5">
          <ZoomButton onClick={() => setZoom((value) => clampZoom(value + 1))} ariaLabel="Zoom in"><Plus className="size-5" /></ZoomButton>
          <ZoomButton onClick={() => setZoom((value) => clampZoom(value - 1))} ariaLabel="Zoom out"><Minus className="size-5" /></ZoomButton>
        </div>

        {/* Selected marker card */}
        {selected && !dropPoint && (
          <div className="absolute inset-x-3 bottom-3 rounded-xl border border-border bg-card p-4 shadow-xl sm:left-auto sm:right-3 sm:max-w-sm">
            <div className="flex items-start gap-3">
              <span className={cn("grid size-9 shrink-0 place-items-center rounded-full text-white", markerStyle(selected.kind, selected.category).container)}>
                {(() => { const Icon = markerStyle(selected.kind, selected.category).icon; return <Icon className="size-4" />; })()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{selected.title}</p>
                {selected.subtitle && <p className="text-xs text-muted-foreground">{selected.subtitle}</p>}
                <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{formatLatLng(selected)}</p>
                {selected.description && <p className="mt-1 text-sm text-muted-foreground">{selected.description}</p>}
                {selectedDistance != null && selectedDistance < 200_000 && (
                  <p className="mt-1 text-xs text-muted-foreground">~{formatDistance(selectedDistance)} from view center</p>
                )}
              </div>
              {selected.kind === "pin" && canEdit && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Delete pin"
                  onClick={() => void deletePin(selected)}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              )}
            </div>
            <div className="mt-3 flex justify-end">
              <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(null)}>Close</Button>
            </div>
          </div>
        )}
      </div>

      {/* Pins list (only when there are pins) */}
      {pins.length > 0 && (
        <div className="rounded-2xl border bg-card p-4">
          <h3 className="text-sm font-semibold">Dropped pins</h3>
          <ul className="mt-3 space-y-2">
            {pins.map((pin) => {
              const style = PIN_STYLES[pin.category] ?? PIN_STYLES.note;
              const Icon = style.icon;
              return (
                <li key={pin.id} className="flex items-center gap-3 text-sm">
                  <span className={cn("grid size-7 shrink-0 place-items-center rounded-full text-white", style.container)}>
                    <Icon className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{pin.title}</span>
                  <span className="font-mono text-xs text-muted-foreground">{pin.latitude.toFixed(4)}, {pin.longitude.toFixed(4)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

function LegendRow({ style, label }: { style: MarkerStyle; label: string }) {
  const Icon = style.icon;
  return (
    <span className="flex items-center gap-2">
      <span className={cn("grid size-4 place-items-center rounded-full text-white", style.container)}>
        <Icon className="size-2.5" />
      </span>
      {label}
    </span>
  );
}

function ZoomButton({ children, onClick, ariaLabel }: { children: React.ReactNode; onClick: () => void; ariaLabel: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="grid size-9 place-items-center rounded-lg bg-slate-900/85 text-slate-100 transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </button>
  );
}

function OfflineBackdrop({ viewport }: { viewport: { width: number; height: number } }) {
  const gridLines = useMemo(() => {
    const step = 48;
    const lines: Array<{ key: string; x1: number; y1: number; x2: number; y2: number; className: string }> = [];
    for (let x = 0; x <= viewport.width; x += step) {
      lines.push({ key: `v${x}`, x1: x, y1: 0, x2: x, y2: viewport.height, className: "stroke-slate-700/40" });
    }
    for (let y = 0; y <= viewport.height; y += step) {
      lines.push({ key: `h${y}`, x1: 0, y1: y, x2: viewport.width, y2: y, className: "stroke-slate-700/40" });
    }
    return lines;
  }, [viewport]);

  return (
    <svg className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <radialGradient id="offline-glow" cx="50%" cy="45%" r="70%">
          <stop offset="0%" stopColor="#334155" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width={viewport.width} height={viewport.height} fill="url(#offline-glow)" />
      {gridLines.map((line) => (
        <line key={line.key} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} strokeWidth={1} className={line.className} />
      ))}
      {/* Compass */}
      <g transform={`translate(${viewport.width - 40}, ${viewport.height - 40})`} className="stroke-slate-500">
        <circle r={16} fill="#0f172a" fillOpacity={0.7} strokeWidth={1} />
        <path d="M0,-8 L4,6 L0,2 L-4,6 Z" fill="#f87171" stroke="none" />
        <path d="M0,8 L4,-6 L0,-2 L-4,-6 Z" fill="#e2e8f0" stroke="none" />
      </g>
    </svg>
  );
}
