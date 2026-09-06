import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TransitSegment } from "@/features/transit/domain/transit-types";
import { TransitCard } from "@/features/transit/components/transit-card";

if (typeof window !== "undefined") {
  window.matchMedia ??= () => ({ matches: false, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as unknown as MediaQueryList;
}

function segment(overrides: Partial<TransitSegment> = {}): TransitSegment {
  return {
    id: "transit-1",
    tripId: "trip-1",
    mode: "flight",
    dayDate: "2026-06-02",
    carrier: "Delta",
    carrierCode: "DL",
    number: "1284",
    gate: "B12",
    terminal: "4",
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

describe("TransitCard", () => {
  afterEach(() => cleanup());

  it("renders flight identity, route, and gate", () => {
    render(<TransitCard segment={segment()} interactive={false} />);
    expect(screen.getByText(/Delta/)).toBeTruthy();
    expect(screen.getByText(/JFK/)).toBeTruthy();
    expect(screen.getByText(/Gate B12/)).toBeTruthy();
    expect(screen.getByText("Scheduled")).toBeTruthy();
  });

  it("shows a delay warning and status badge for a delayed leg", () => {
    render(<TransitCard segment={segment({ status: "delayed", delayMinutes: 40, statusMessage: "Waiting on weather" })} interactive={false} />);
    expect(screen.getByText(/Delayed by 40 min/)).toBeTruthy();
    expect(screen.getByText("Delayed")).toBeTruthy();
    expect(screen.getByText("Waiting on weather")).toBeTruthy();
  });

  it("flags a cancelled leg", () => {
    render(<TransitCard segment={segment({ status: "cancelled" })} interactive={false} />);
    expect(screen.getByText("Cancelled")).toBeTruthy();
    expect(screen.getByText(/has been cancelled/)).toBeTruthy();
  });

  it("triggers refresh when tapped", () => {
    const onRefresh = vi.fn();
    render(<TransitCard segment={segment()} onRefresh={onRefresh} />);
    fireEvent.click(screen.getByRole("button", { name: /Refresh status/ }));
    expect(onRefresh).toHaveBeenCalledWith(expect.objectContaining({ id: "transit-1" }));
  });
});
