import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Trip } from "@/features/domain/entities";
import { TipSplitCalculator } from "@/features/finance/components/tip-calculator";

if (typeof window !== "undefined") {
  window.matchMedia ??= () => ({ matches: false, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as unknown as MediaQueryList;
}

const trip: Trip = {
  id: "trip-1",
  ownerId: "owner-1",
  name: "Paris Week",
  description: null,
  destination: "Paris",
  latitude: null,
  longitude: null,
  placeId: null,
  timeZone: null,
  startDate: "2026-06-01",
  endDate: "2026-06-08",
  status: "planned",
  startedAt: null,
  completedAt: null,
  coverImageUrl: null,
  adultCount: 2,
  childCount: 0,
  baseCurrency: "USD",
  createdBy: "owner-1",
  updatedBy: "owner-1",
  deletedBy: null,
  restoredAt: null,
  restoredBy: null,
  cancelledAt: null,
  statusChangedAt: "2026-01-01T00:00:00Z",
  statusChangedBy: "owner-1",
  version: 1,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  deletedAt: null,
};

beforeEach(() => cleanup());
afterEach(() => cleanup());

describe("TipSplitCalculator", () => {
  it("shows destination-specific etiquette", () => {
    render(<TipSplitCalculator trip={trip} />);

    expect(screen.getByText(/Tipping etiquette — Europe/)).toBeTruthy();
    expect(screen.getByText(/Expected: 5–10%/)).toBeTruthy();
  });

  it("defaults the tip selector to the destination norm", () => {
    render(<TipSplitCalculator trip={trip} />);

    const tipInput = screen.getByLabelText("Custom tip percent") as HTMLInputElement;
    expect(tipInput.value).toBe("5"); // Europe default.
  });

  it("computes a tip, tax, and per-person split independently", () => {
    render(<TipSplitCalculator trip={trip} />);

    fireEvent.change(screen.getByLabelText("Subtotal"), { target: { value: "100" } });
    // Europe default tip = 5%, split between 2 people.
    fireEvent.change(screen.getByLabelText("Split between"), { target: { value: "2" } });

    expect(screen.getByText(/Total/)).toBeTruthy();
    // $105.00 total → $52.50 per person.
    expect(screen.getByText(/\$105\.00/)).toBeTruthy();
    expect(screen.getByText(/\$52\.50 per person/)).toBeTruthy();
  });
});
