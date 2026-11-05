import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TravelJournalView } from "@/features/journal/components/travel-journal-view";

const state = vi.hoisted(() => ({
  save: vi.fn(),
}));

vi.mock("@/features/journal/data/dexie-journal-repository", () => ({
  journalRepository: {
    watchByTrip: (_tripId: string, onChange: (entries: never[]) => void) => {
      onChange([]);
      return () => undefined;
    },
    save: (...args: unknown[]) => state.save(...args),
  },
}));

vi.mock("@/features/journal/lib/use-travel-journal", () => ({
  useTravelJournal: () => ({
    loading: false,
    days: [],
    summary: {
      totalDays: 1,
      totalActivities: 0,
      totalPhotos: 0,
      totalSpentMinor: 0n,
      startDate: "2026-09-23",
      endDate: "2026-09-23",
    },
  }),
}));

describe("TravelJournalView", () => {
  beforeEach(() => {
    state.save.mockReset();
  });

  it("keeps a rejected journal experience save unsaved and announces an alert", async () => {
    state.save.mockRejectedValueOnce(new Error("local database unavailable"));
    render(
      <TravelJournalView
        tripId="trip-1"
        userId="user-1"
        baseCurrency="EUR"
        startDate="2026-09-23"
        endDate="2026-09-23"
        canEdit
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const experience = screen.getByLabelText("How was your day?");
    fireEvent.change(experience, { target: { value: "We found a quiet cafe." } });
    fireEvent.blur(experience);

    expect(state.save).toHaveBeenCalledWith("trip-1", "2026-09-23", "We found a quiet cafe.");
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Something went wrong. Please try again."));
    expect(screen.getByText("Unsaved")).toBeTruthy();
    expect((experience as HTMLTextAreaElement).value).toBe("We found a quiet cafe.");

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByRole("alert").textContent).toBe("Something went wrong. Please try again.");
  });
});
