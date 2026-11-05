import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PackingListView } from "@/features/packing/components/packing-list-view";
import { packingRepository } from "@/features/packing/data/dexie-packing-repository";
import type { PackingItem } from "@/features/packing/domain/packing-types";
import type { Trip } from "@/features/domain/entities";
import { tripRepository } from "@/features/trips/data/dexie-trip-repository";
import { I18nProvider } from "@/lib/i18n/i18n-provider";

vi.mock("@/features/packing/data/dexie-packing-repository", () => ({
  packingRepository: {
    watchByTrip: vi.fn(),
    applySuggested: vi.fn(),
    toggle: vi.fn(),
    remove: vi.fn(),
    updateQuantity: vi.fn(),
    setPacked: vi.fn(),
    setPackedForReturn: vi.fn(),
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
    packedForReturn: false,
    isSuggested: true,
    suggestedReason: "recommended",
    position: 0,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

function renderList(items: PackingItem[], mode: "outbound" | "return" = "outbound") {
  vi.mocked(packingRepository.watchByTrip).mockImplementation((_tripId, onChange) => {
    onChange(items);
    return () => {};
  });
  vi.mocked(packingRepository.applySuggested).mockResolvedValue(items);
  render(
    <I18nProvider>
      <PackingListView tripId="trip-1" trip={trip} activities={[]} mode={mode} />
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

  it("toggles packedForReturn without changing the outbound check", () => {
    vi.mocked(packingRepository.watchByTrip).mockImplementation((_tripId, onChange) => {
      onChange([item({ id: "adapter", name: "Travel adapter", isPacked: true, packedForReturn: false })]);
      return () => {};
    });
    render(
      <I18nProvider>
        <PackingListView tripId="trip-1" trip={trip} activities={[]} mode="return" />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: "Pack for home" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Delete item" })).toBeNull();
    const checkbox = screen.getByRole("checkbox", { name: /Travel adapter/ });
    expect((checkbox as HTMLInputElement).checked).toBe(false);
    fireEvent.click(checkbox);
    expect(packingRepository.setPackedForReturn).toHaveBeenCalledWith(["adapter"], true);
    expect(packingRepository.toggle).not.toHaveBeenCalled();
  });

  it("shows an alert when auto-seeding fails", async () => {
    vi.mocked(packingRepository.watchByTrip).mockImplementation((_tripId, onChange) => {
      onChange([]);
      return () => {};
    });
    vi.mocked(packingRepository.applySuggested).mockRejectedValueOnce(new Error("Storage temporarily unavailable"));
    render(
      <I18nProvider>
        <PackingListView tripId="trip-1" trip={trip} activities={[]} />
      </I18nProvider>,
    );

    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Storage temporarily unavailable"));
  });

  it("shows an alert when toggling an item fails", async () => {
    vi.mocked(packingRepository.toggle).mockRejectedValueOnce(new Error("Unable to save packed item"));
    renderList([item({ id: "adapter", name: "Travel adapter" })]);

    fireEvent.click(screen.getByRole("checkbox", { name: /Travel adapter/ }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Unable to save packed item"));
  });

  it("shows an alert when toggling a return item fails", async () => {
    vi.mocked(packingRepository.setPackedForReturn).mockRejectedValueOnce(new Error("Unable to save return packing"));
    renderList([item({ id: "adapter", name: "Travel adapter" })], "return");

    fireEvent.click(screen.getByRole("checkbox", { name: /Travel adapter/ }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Unable to save return packing"));
  });

  it("shows an alert when removing an item fails", async () => {
    vi.mocked(packingRepository.remove).mockRejectedValueOnce(new Error("Unable to remove item"));
    renderList([item({ id: "adapter", name: "Travel adapter" })]);

    fireEvent.click(screen.getByRole("button", { name: "Delete item" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Unable to remove item"));
  });

  it("shows an alert when changing quantity fails", async () => {
    vi.mocked(packingRepository.updateQuantity).mockRejectedValueOnce(new Error("Unable to update quantity"));
    renderList([item({ id: "adapter", name: "Travel adapter" })]);

    fireEvent.click(screen.getByRole("button", { name: "Increase Travel adapter quantity" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Unable to update quantity"));
  });

  it("shows an alert when packing a category fails", async () => {
    vi.mocked(packingRepository.setPacked).mockRejectedValueOnce(new Error("Unable to pack category"));
    renderList([item({ id: "adapter", name: "Travel adapter" })]);

    fireEvent.click(screen.getByRole("button", { name: "Pack all" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Unable to pack category"));
  });

  it("shows an alert when packing a return category fails", async () => {
    vi.mocked(packingRepository.setPackedForReturn).mockRejectedValueOnce(new Error("Unable to pack return category"));
    renderList([item({ id: "adapter", name: "Travel adapter" })], "return");

    fireEvent.click(screen.getByRole("button", { name: "Pack all" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Unable to pack return category"));
  });

  it("shows an alert when confirming packed toiletries fails", async () => {
    vi.mocked(tripRepository.update).mockRejectedValueOnce(new Error("Unable to confirm toiletries"));
    renderList([item({ id: "soap", name: "Soap", category: "toiletries" })]);

    fireEvent.click(screen.getByRole("button", { name: "Pack all" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Unable to confirm toiletries"));
  });

  it("shows an alert when adding an item fails and clears the pending state", async () => {
    vi.mocked(packingRepository.addCustom).mockRejectedValueOnce(new Error("Unable to add item"));
    renderList([]);

    fireEvent.change(screen.getByLabelText("Item name"), { target: { value: "Sunscreen" } });
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Unable to add item"));
    expect((screen.getByRole("button", { name: "Add item" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
