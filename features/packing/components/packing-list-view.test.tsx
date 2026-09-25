import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PackingListView } from "@/features/packing/components/packing-list-view";
import { packingRepository } from "@/features/packing/data/dexie-packing-repository";
import type { PackingItem } from "@/features/packing/domain/packing-types";
import type { Trip } from "@/features/domain/entities";
import { I18nProvider } from "@/lib/i18n/i18n-provider";

vi.mock("@/features/packing/data/dexie-packing-repository", () => ({
  packingRepository: {
    watchByTrip: vi.fn(),
    applySuggested: vi.fn(),
    toggle: vi.fn(),
    remove: vi.fn(),
    updateQuantity: vi.fn(),
    setPacked: vi.fn(),
    addCustom: vi.fn(),
    resetToSuggested: vi.fn(),
  },
}));

vi.mock("@/features/trips/data/dexie-trip-repository", () => ({
  tripRepository: { update: vi.fn() },
}));

const trip = {
  id: "trip-1",
  startDate: "2026-06-01",
  endDate: "2026-06-06",
  latitude: 40,
  packingConfirmed: false,
} as Trip;

function item(overrides: Partial<PackingItem> & Pick<PackingItem, "id" | "name">): PackingItem {
  return {
    tripId: "trip-1",
    category: "electronics",
    quantity: 1,
    isPacked: false,
    isSuggested: true,
    suggestedReason: "recommended",
    position: 0,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

function renderList(items: PackingItem[]) {
  vi.mocked(packingRepository.watchByTrip).mockImplementation((_tripId, onChange) => {
    onChange(items);
    return () => {};
  });
  vi.mocked(packingRepository.applySuggested).mockResolvedValue(items);
  render(
    <I18nProvider>
      <PackingListView tripId="trip-1" trip={trip} activities={[]} />
    </I18nProvider>,
  );
}

describe("PackingListView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("labels untouched suggestions and keeps a visible delete control beside quantity", () => {
    renderList([
      item({ id: "adapter", name: "Travel adapter" }),
      item({ id: "phone", name: "Phone", suggestedReason: "always" }),
      item({ id: "headphones", name: "Headphones / earbuds", suggestedReason: "recommended" }),
      item({ id: "packed", name: "Power bank", isPacked: true }),
      item({ id: "custom", name: "Snorkel", isSuggested: false, suggestedReason: null, category: "gear" }),
    ]);

    expect(screen.getByText("Travel adapter")).toBeTruthy();
    expect(screen.getAllByText("Suggested")).toHaveLength(2);
    expect(screen.queryByText("Headphones / earbuds")?.closest("li")?.textContent).not.toContain("Suggested");
    expect(screen.queryByText("Snorkel")?.closest("li")?.textContent).not.toContain("Suggested");

    const deleteButtons = screen.getAllByRole("button", { name: "Delete item" });
    expect(deleteButtons).toHaveLength(5);
    deleteButtons.forEach((button) => {
      expect(button.className).not.toContain("border");
      expect(button.className).toContain("text-destructive");
    });
    expect(screen.getByRole("button", { name: "Increase Travel adapter quantity" }).className).toContain("bg-linear-to-br");

    fireEvent.click(deleteButtons[0]!);
    expect(packingRepository.remove).toHaveBeenCalledWith("adapter");
  });
});
