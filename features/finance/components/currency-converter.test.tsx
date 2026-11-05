import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Trip } from "@/features/domain/entities";
import { currencyRateRepository } from "@/features/finance/data/dexie-currency-rate-repository";
import { CurrencyConverter } from "@/features/finance/components/currency-converter";

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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(currencyRateRepository.getRate).mockResolvedValue(undefined);
  vi.mocked(currencyRateRepository.ensureDefaults).mockResolvedValue(undefined);
});

afterEach(() => cleanup());

describe("CurrencyConverter", () => {
  it("converts an amount using the offline default rate", async () => {
    render(<CurrencyConverter trip={trip} />);

    // 1 USD = 0.92 EUR via the built-in default table.
    await screen.findByDisplayValue("0.92");

    const amountInput = screen.getByLabelText("Amount");
    fireEvent.change(amountInput, { target: { value: "100" } });

    expect(await screen.findByDisplayValue("€92.00")).toBeTruthy();
  });

  it("persists a custom rate when saved", async () => {
    render(<CurrencyConverter trip={trip} />);

    await screen.findByDisplayValue("0.92");
    const rateInput = screen.getByLabelText(/^Rate/);
    fireEvent.change(rateInput, { target: { value: "0.95" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Save rate/ }));
      await Promise.resolve();
    });

    expect(currencyRateRepository.saveRate).toHaveBeenCalledWith("USD", "EUR", 0.95);
  });

  it("continues with the built-in rate when loading the cached rate fails", async () => {
    vi.mocked(currencyRateRepository.getRate).mockRejectedValue(new Error());

    render(<CurrencyConverter trip={trip} />);

    expect(await screen.findByDisplayValue("0.92")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(/something went wrong/i);

    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "100" } });
    expect(await screen.findByDisplayValue("€92.00")).toBeTruthy();
  });

  it("contains failures while seeding default rates", async () => {
    vi.mocked(currencyRateRepository.ensureDefaults).mockRejectedValue(new Error());

    render(<CurrencyConverter trip={trip} />);

    expect(await screen.findByDisplayValue("0.92")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(/something went wrong/i);
  });

  it("reports a failed manual rate save without showing success", async () => {
    vi.mocked(currencyRateRepository.saveRate).mockRejectedValue(new Error());
    render(<CurrencyConverter trip={trip} />);

    await screen.findByDisplayValue("0.92");
    fireEvent.change(screen.getByLabelText(/^Rate/), { target: { value: "0.95" } });
    fireEvent.click(screen.getByRole("button", { name: /Save rate/ }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/something went wrong/i);
    expect(screen.getByRole("button", { name: /Save rate/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Saved/ })).toBeNull();
  });
});
