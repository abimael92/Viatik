import { describe, expect, it } from "vitest";

import {
  autoZoomForBounds,
  clampZoom,
  computeBounds,
  formatDistance,
  getBoundsCenter,
  haversineDistanceKm,
  haversineDistanceMeters,
  inverseMercatorY,
  MAX_ZOOM,
  mercatorY,
  MIN_ZOOM,
  projectToWorld,
  type GeoBounds,
} from "@/features/maps/lib/geo-utils";

describe("haversineDistance", () => {
  it("returns ~0 for identical points", () => {
    const point = { latitude: 40.7128, longitude: -74.006 };
    expect(haversineDistanceMeters(point, point)).toBeCloseTo(0, 6);
  });

  it("computes a known reference distance (NYC → LA ≈ 3940 km)", () => {
    const nyc = { latitude: 40.7128, longitude: -74.006 };
    const la = { latitude: 34.0522, longitude: -118.2437 };
    expect(haversineDistanceKm(nyc, la)).toBeGreaterThan(3900);
    expect(haversineDistanceKm(nyc, la)).toBeLessThan(3980);
  });

  it("is symmetric (distance A→B equals B→A)", () => {
    const a = { latitude: 51.5074, longitude: -0.1278 };
    const b = { latitude: 48.8566, longitude: 2.3522 };
    expect(haversineDistanceMeters(a, b)).toBeCloseTo(haversineDistanceMeters(b, a), 6);
  });

  it("approximates a small city-block distance", () => {
    // ~1 degree of latitude is ≈ 111 km.
    const a = { latitude: 0, longitude: 0 };
    const b = { latitude: 0.01, longitude: 0 };
    expect(haversineDistanceMeters(a, b)).toBeCloseTo(1111.95, -1);
  });
});

describe("computeBounds / getBoundsCenter", () => {
  it("returns null for empty input", () => {
    expect(computeBounds([])).toBeNull();
  });

  it("finds the min/max corners for a set of points", () => {
    const bounds = computeBounds([
      { latitude: 35, longitude: 135 },
      { latitude: 36.5, longitude: 134 },
      { latitude: 35.5, longitude: 136 },
    ]);
    expect(bounds).toEqual({ minLat: 35, maxLat: 36.5, minLng: 134, maxLng: 136 });
  });

  it("handles a single point as zero-span bounds", () => {
    const bounds = computeBounds([{ latitude: 10, longitude: 20 }]);
    expect(bounds).toEqual({ minLat: 10, maxLat: 10, minLng: 20, maxLng: 20 });
  });

  it("returns the centroid of the bounds", () => {
    const bounds: GeoBounds = { minLat: 10, maxLat: 20, minLng: 30, maxLng: 40 };
    expect(getBoundsCenter(bounds)).toEqual({ latitude: 15, longitude: 35 });
  });
});

describe("projectToWorld", () => {
  it("maps the antimeridian-ish origin consistently across zooms", () => {
    const z0 = projectToWorld(0, 0, 0);
    expect(z0.x).toBeCloseTo(128); // half of the 256px world
    expect(z0.y).toBeCloseTo(128);
    const z1 = projectToWorld(0, 0, 1);
    expect(z1.x).toBeCloseTo(256);
    expect(z1.y).toBeCloseTo(256);
  });

  it("increases world size by 2x per zoom level", () => {
    const a = projectToWorld(40, -70, 10);
    const b = projectToWorld(40, -70, 11);
    expect(b.x).toBeCloseTo(a.x * 2);
    expect(b.y).toBeCloseTo(a.y * 2);
  });
});

describe("inverseMercatorY", () => {
  it("round-trips with mercatorY across latitudes", () => {
    for (const lat of [-60, -30, 0, 10, 45, 80]) {
      expect(inverseMercatorY(mercatorY(lat))).toBeCloseTo(lat, 4);
    }
  });

  it("maps the world center to latitude 0", () => {
    expect(inverseMercatorY(0.5)).toBeCloseTo(0, 6);
  });
});

describe("autoZoomForBounds", () => {
  it("chooses a high zoom for a tight local area", () => {
    const bounds = computeBounds([
      { latitude: 40.712, longitude: -74.007 },
      { latitude: 40.713, longitude: -74.005 },
    ]);
    expect(autoZoomForBounds(bounds as GeoBounds, 800, 600)).toBeGreaterThan(12);
  });

  it("chooses a low zoom for a large region (whole world-ish)", () => {
    const bounds: GeoBounds = { minLat: -60, maxLat: 60, minLng: -170, maxLng: 170 };
    expect(autoZoomForBounds(bounds, 800, 600)).toBeLessThan(5);
  });

  it("is bounded by the min/max zoom constants", () => {
    const tiny = computeBounds([
      { latitude: 40.7128, longitude: -74.006 },
      { latitude: 40.7129, longitude: -74.0059 },
    ]);
    const huge: GeoBounds = { minLat: -85, maxLat: 85, minLng: -180, maxLng: 180 };

    expect(autoZoomForBounds(tiny as GeoBounds, 100, 100)).toBeLessThanOrEqual(MAX_ZOOM);
    expect(autoZoomForBounds(huge, 10, 10)).toBeGreaterThanOrEqual(MIN_ZOOM);
  });

  it("respects padding so markers are not clipped to the edge", () => {
    const bounds: GeoBounds = { minLat: 40.7, maxLat: 40.8, minLng: -74.1, maxLng: -73.9 };
    // More padding → less usable space → smaller (more zoomed out) zoom.
    expect(autoZoomForBounds(bounds, 800, 600, 120)).toBeLessThanOrEqual(
      autoZoomForBounds(bounds, 800, 600, 20)
    );
  });

  it("falls back to a street-level zoom for a single point", () => {
    const bounds = computeBounds([{ latitude: 40.7128, longitude: -74.006 }]);
    expect(autoZoomForBounds(bounds as GeoBounds, 800, 600)).toBe(12);
  });

  it("never exceeds the zoom clamp even for extreme inputs", () => {
    expect(clampZoom(999)).toBe(MAX_ZOOM);
    expect(clampZoom(-5)).toBe(MIN_ZOOM);
  });
});

describe("formatDistance", () => {
  it("formats meters and kilometers", () => {
    expect(formatDistance(820)).toBe("820 m");
    expect(formatDistance(1400)).toBe("1.4 km");
    expect(formatDistance(0)).toBe("0 m");
  });
});
