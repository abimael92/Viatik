import { describe, expect, it } from "vitest";

import { isHydratingTrip } from "@/features/trips/lib/trip-hydration";

describe("isHydratingTrip", () => {
  it("waits for the first sync when the trip is not in IndexedDB yet", () => {
    expect(isHydratingTrip(true, { status: "idle", lastSyncAt: null }, false)).toBe(true);
    expect(isHydratingTrip(true, { status: "syncing", lastSyncAt: null }, false)).toBe(true);
  });

  it("reports not found once a sync has completed", () => {
    expect(isHydratingTrip(true, { status: "idle", lastSyncAt: "2026-09-28T12:00:00.000Z" }, false)).toBe(false);
    expect(isHydratingTrip(true, { status: "error", lastSyncAt: "2026-09-28T12:00:00.000Z" }, false)).toBe(false);
  });

  it("stops waiting when sync cannot reach the server", () => {
    expect(isHydratingTrip(true, { status: "offline", lastSyncAt: null }, false)).toBe(false);
    expect(isHydratingTrip(true, { status: "error", lastSyncAt: null }, false)).toBe(false);
  });

  it("stops waiting after the timeout", () => {
    expect(isHydratingTrip(true, { status: "syncing", lastSyncAt: null }, true)).toBe(false);
  });

  it("never hydrates when the trip is already local", () => {
    expect(isHydratingTrip(false, { status: "syncing", lastSyncAt: null }, false)).toBe(false);
  });
});
