/**
 * Geospatial helpers for the Offline Maps feature. Pure, dependency-free math
 * used for auto-zoom/bounds fitting and distance calculations. Everything here
 * works fully offline — no network tile or geocoding dependency.
 */

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface GeoBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/** Number of pixels in a map "world" at zoom level 0 (360° of longitude). */
export const TILE_SIZE = 256;
/** Mercator projection breaks down outside this latitude range. */
const MAX_LATITUDE = 85.0511287798;
const EARTH_RADIUS_METERS = 6371008.8;
export const MIN_ZOOM = 3;
export const MAX_ZOOM = 18;

export function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function clampLatitude(latitude: number): number {
  return Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, latitude));
}

/**
 * Haversine great-circle distance between two points, in meters.
 * Accurate to well under 0.5% for short to medium distances.
 */
export function haversineDistanceMeters(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const latA = toRadians(a.latitude);
  const latB = toRadians(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(latA) * Math.cos(latB) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_METERS * c;
}

/** Haversine distance in kilometers. */
export function haversineDistanceKm(a: GeoPoint, b: GeoPoint): number {
  return haversineDistanceMeters(a, b) / 1000;
}

/** Axis-aligned bounding box covering every point, or `null` for empty input. */
export function computeBounds(points: readonly GeoPoint[]): GeoBounds | null {
  if (!points || points.length === 0) return null;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const point of points) {
    minLat = Math.min(minLat, point.latitude);
    maxLat = Math.max(maxLat, point.latitude);
    minLng = Math.min(minLng, point.longitude);
    maxLng = Math.max(maxLng, point.longitude);
  }
  return { minLat, maxLat, minLng, maxLng };
}

/** Center (centroid) of a bounds rectangle. */
export function getBoundsCenter(bounds: GeoBounds): GeoPoint {
  return {
    latitude: (bounds.minLat + bounds.maxLat) / 2,
    longitude: (bounds.minLng + bounds.maxLng) / 2,
  };
}

/** Normalized (0..1) Mercator y-coordinate for a latitude. */
export function mercatorY(latitude: number): number {
  const rad = toRadians(clampLatitude(latitude));
  return (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2;
}

/** World-space pixel coordinates (x, y) for a lat/lng at a given zoom level. */
export function projectToWorld(
  latitude: number,
  longitude: number,
  zoom: number
): { x: number; y: number } {
  const size = TILE_SIZE * 2 ** zoom;
  const x = ((longitude + 180) / 360) * size;
  const y = mercatorY(latitude) * size;
  return { x, y };
}

/** Inverse of `mercatorY`: latitude from a normalized (0..1) y-coordinate. */
export function inverseMercatorY(y: number): number {
  const n = Math.max(0, Math.min(1, y));
  return (180 / Math.PI) * (2 * Math.atan(Math.exp(Math.PI * (1 - 2 * n))) - Math.PI / 2);
}

export function clampZoom(zoom: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
}

/**
 * Picks the largest integer zoom level that keeps the given bounds fully
 * visible inside a `viewportWidth × viewportHeight` pixel viewport, leaving
 * `padding` pixels of margin on every side. Falls back to a street-level zoom
 * for degenerate (single-point) bounds.
 */
export function autoZoomForBounds(
  bounds: GeoBounds,
  viewportWidth: number,
  viewportHeight: number,
  padding = 60
): number {
  const availableWidth = Math.max(viewportWidth - padding * 2, 1);
  const availableHeight = Math.max(viewportHeight - padding * 2, 1);
  const lngSpan = bounds.maxLng - bounds.minLng;
  const latSpan = bounds.maxLat - bounds.minLat;

  // A single point (or overlapping points) has no spatial span; use a default.
  if (lngSpan <= 0 && latSpan <= 0) return 12;

  const ySpan = Math.abs(mercatorY(bounds.maxLat) - mercatorY(bounds.minLat));
  const safeLngSpan = Math.max(lngSpan, 1e-9);
  const safeYSpan = Math.max(ySpan, 1e-9);

  const zoomForWidth = Math.log2((availableWidth / TILE_SIZE) * (360 / safeLngSpan));
  const zoomForHeight = Math.log2(availableHeight / TILE_SIZE / safeYSpan);

  return clampZoom(Math.floor(Math.min(zoomForWidth, zoomForHeight)));
}

/**
 * Human-friendly distance label from a meter value: "820 m", "1.4 km", …
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
