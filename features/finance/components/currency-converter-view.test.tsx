import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Trip } from "@/features/domain/entities";
import { currencyRateRepository } from "@/features/finance/data/dexie-currency-rate-repository";
import { CurrencyConverterView } from "@/features/finance/components/currency-converter-view";

if (typeof window !== "undefined") {
  window.matchMedia ??= () => ({ matches: false, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as unknown as MediaQueryList;
}

vi.mock("@/features/finance/data/dexie-currency-rate-repository", () => ({
  currencyRateRepository: {
    getRate: vi.fn(),
    saveRate: vi.fn(),
    ensureDefaults: vi.fn().mockResolvedValue(undefined),
    listRates: vi.fn(),
  },
}));

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
  coverImageUrl: null,
  adultCount: 2,
  childCount: 0,
  baseCurrency: "USD",
  totalBudgetMinor: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  deletedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  // No cached rate → the component falls back to the built-in offline default.
  vi.mocked(currencyRateRepository.getRate).mockResolvedValue(undefined);
});

afterEach(() => cleanup());

describe("CurrencyConverterView", () => {
  it("shows destination-specific etiquette", async () => {
    render(<CurrencyConverterView trip={trip} />);

    expect(await screen.findByText(/Tipping etiquette — Europe/)).toBeTruthy();
    expect(screen.getByText(/Expected: 5–10%/)).toBeTruthy();
  });

  it("defaults the tip selector to the destination norm", async () => {
    render(<CurrencyConverterView trip={trip} />);

    await screen.findByText(/Tipping etiquette — Europe/);
    const tipInput = screen.getByLabelText("Custom tip percent") as HTMLInputElement;
    expect(tipInput.value).toBe("5"); // Europe default.
  });

  it("converts an amount using the offline default rate", async () => {
    render(<CurrencyConverterView trip={trip} />);

    // 1 USD = 0.92 EUR via the built-in default table.
    await screen.findByDisplayValue("0.92");

    const amountInput = screen.getByLabelText("Amount");
    fireEvent.change(amountInput, { target: { value: "100" } });

    expect(await screen.findByDisplayValue("€92.00")).toBeTruthy();
  });

  it("persists a custom rate when saved", async () => {
    render(<CurrencyConverterView trip={trip} />);

    await screen.findByDisplayValue("0.92");
    const rateInput = screen.getByLabelText(/^Rate/);
    fireEvent.change(rateInput, { target: { value: "0.95" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Save rate/ }));
      await Promise.resolve();
    });

    expect(currencyRateRepository.saveRate).toHaveBeenCalledWith("USD", "EUR", 0.95);
  });
});
