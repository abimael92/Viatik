import { describe, expect, it, vi } from "vitest";

import type { TransitSegment, TransitStatusUpdate } from "@/features/transit/domain/transit-types";
import {
  applyTransitStatusUpdate,
  computeDelayMinutes,
  deriveStatusState,
  fetchTransitStatus,
  normalizeStatusString,
  parseTransitStatusUpdate,
} from "@/features/transit/lib/transit-service";

function segment(overrides: Partial<TransitSegment> = {}): TransitSegment {
  return {
    id: "transit-1",
    tripId: "trip-1",
    mode: "flight",
    dayDate: "2026-06-02",
    carrier: "Delta",
    carrierCode: "DL",
    number: "1284",
    gate: null,
    terminal: null,
    platform: null,
    origin: "JFK",
    destination: "CDG",
    scheduledDeparture: "2026-06-02T10:00:00Z",
    scheduledArrival: "2026-06-02T14:30:00Z",
    status: "scheduled",
    statusMessage: null,
    actualDeparture: null,
    actualArrival: null,
    estimatedDeparture: null,
    estimatedArrival: null,
    delayMinutes: null,
    createdBy: "user-1",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    deletedAt: null,
    ...overrides,
  };
}

describe("normalizeStatusString", () => {
  it("maps provider vocabulary to our states", () => {
    expect(normalizeStatusString("DELAYED")).toBe("delayed");
    expect(normalizeStatusString("on_time")).toBe("scheduled");
    expect(normalizeStatusString("canceled")).toBe("cancelled");
    expect(normalizeStatusString("arrival")).toBe("arrived");
    expect(normalizeStatusString("")).toBe("scheduled");
    expect(normalizeStatusString(null)).toBe("scheduled");
  });
});

describe("computeDelayMinutes", () => {
  it("computes a positive delay and ignores early arrivals", () => {
    expect(computeDelayMinutes("2026-06-02T10:00:00Z", "2026-06-02T10:45:00Z")).toBe(45);
    expect(computeDelayMinutes("2026-06-02T10:00:00Z", "2026-06-02T09:30:00Z")).toBeNull();
    expect(computeDelayMinutes("2026-06-02T10:00:00Z", null)).toBeNull();
  });
});

describe("parseTransitStatusUpdate", () => {
  it("parses a snake_case delayed payload and computes the delay", () => {
    const update = parseTransitStatusUpdate(
      {
        status: "delayed",
        status_message: "Gate changed to B12",
        estimated_departure: "2026-06-02T10:25:00Z",
        estimated_arrival: "2026-06-02T14:55:00Z",
      },
      segment(),
    );
    expect(update).toMatchObject({
      status: "delayed",
      statusMessage: "Gate changed to B12",
      estimatedDeparture: "2026-06-02T10:25:00.000Z",
      delayMinutes: 25,
    });
  });

  it("handles camelCase fields and parses actual times", () => {
    const update = parseTransitStatusUpdate(
      { status: "departed", actualDeparture: "2026-06-02T10:02:00Z", actualArrival: "2026-06-02T14:35:00Z" },
      segment(),
    );
    expect(update?.status).toBe("departed");
    expect(update?.actualDeparture).toBe("2026-06-02T10:02:00.000Z");
  });

  it("returns null for unusable payloads", () => {
    expect(parseTransitStatusUpdate(null, segment())).toBeNull();
    expect(parseTransitStatusUpdate("nope", segment())).toBeNull();
    expect(parseTransitStatusUpdate({}, segment())).toMatchObject({ status: "scheduled" });
  });
});

describe("applyTransitStatusUpdate", () => {
  it("merges an update onto a segment", () => {
    const update: TransitStatusUpdate = {
      status: "delayed",
      statusMessage: "Waiting on weather",
      estimatedDeparture: "2026-06-02T11:00:00Z",
      estimatedArrival: null,
      actualDeparture: null,
      actualArrival: null,
      delayMinutes: 60,
    };
    const updated = applyTransitStatusUpdate(segment(), update);
    expect(updated.status).toBe("delayed");
    expect(updated.delayMinutes).toBe(60);
    expect(updated.updatedAt).not.toBe(segment().updatedAt);
  });
});

describe("deriveStatusState", () => {
  const ten = new Date("2026-06-02T10:00:00Z");

  it("returns terminal states authoritatively", () => {
    expect(deriveStatusState(segment({ status: "cancelled" }), ten)).toBe("cancelled");
    expect(deriveStatusState(segment({ status: "landed" }), ten)).toBe("landed");
    expect(deriveStatusState(segment({ status: "departed" }), ten)).toBe("departed");
  });

  it("promotes a scheduled leg with delay data to delayed", () => {
    expect(deriveStatusState(segment({ delayMinutes: 40 }), ten)).toBe("delayed");
  });

  it("promotes a flight inside its boarding window to boarding", () => {
    // 09:30 is 30 minutes before the 10:00 departure → boarding.
    expect(deriveStatusState(segment({ status: "scheduled" }), new Date("2026-06-02T09:30:00Z"))).toBe("boarding");
    // 08:00 is 2 hours out → still scheduled.
    expect(deriveStatusState(segment({ status: "scheduled" }), new Date("2026-06-02T08:00:00Z"))).toBe("scheduled");
    // Trains do not use a boarding window.
    expect(
      deriveStatusState(segment({ mode: "train", status: "scheduled" }), new Date("2026-06-02T09:30:00Z")),
    ).toBe("scheduled");
  });

  it("keeps an explicit delayed state", () => {
    expect(deriveStatusState(segment({ status: "delayed" }), ten)).toBe("delayed");
  });
});

describe("fetchTransitStatus", () => {
  it("returns live data when the provider responds", async () => {
    const provider = { fetchStatus: vi.fn().mockResolvedValue({ status: "delayed", statusMessage: "x", estimatedDeparture: "2026-06-02T10:20:00Z", estimatedArrival: null, delayMinutes: 20 }) };
    const save = vi.fn().mockResolvedValue(undefined);
    const result = await fetchTransitStatus(segment(), {
      provider,
      cache: { getCached: vi.fn(), save },
      offline: false,
    });
    expect(result.source).toBe("live");
    expect(result.segment.status).toBe("delayed");
    expect(save).toHaveBeenCalledWith("transit-1", expect.objectContaining({ status: "delayed" }));
  });

  it("falls back to the cache when offline or the provider fails", async () => {
    const cached: TransitStatusUpdate = { status: "delayed", statusMessage: "cached", estimatedDeparture: null, estimatedArrival: null, delayMinutes: 15 };
    const cache = { getCached: vi.fn().mockResolvedValue(cached), save: vi.fn() };

    // Offline → skip provider, use cache.
    const offline = await fetchTransitStatus(segment(), { provider: { fetchStatus: vi.fn() }, cache, offline: true });
    expect(offline.source).toBe("cache");
    expect(offline.segment.delayMinutes).toBe(15);

    // Provider throws → cache.
    const failing = await fetchTransitStatus(segment(), {
      provider: { fetchStatus: vi.fn().mockRejectedValue(new Error("boom")) },
      cache,
    });
    expect(failing.source).toBe("cache");
  });

  it("returns the segment unchanged when nothing is available", async () => {
    const result = await fetchTransitStatus(segment(), { offline: true });
    expect(result.source).toBe("fallback");
    expect(result.segment).toEqual(segment());
  });
});
