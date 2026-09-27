import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TripNotesBoard } from "@/features/trips/components/home/trip-notes-board";
import { tripNoteRepository } from "@/features/trips/data/dexie-trip-note-repository";

vi.mock("@/features/trips/data/dexie-trip-note-repository", () => ({
  tripNoteRepository: {
    watchByTrip: vi.fn((_tripId: string, onChange: (notes: unknown[]) => void) => {
      onChange([
        {
          id: "note-1",
          tripId: "trip-1",
          userId: "user-1",
          content: "Buffet closes at 12 PM",
          createdBy: "user-1",
          updatedBy: "user-1",
          deletedBy: null,
          version: 1,
          createdAt: "2026-09-27T12:00:00.000Z",
          updatedAt: "2026-09-27T12:00:00.000Z",
          deletedAt: null,
        },
      ]);
      return () => {};
    }),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TripNotesBoard", () => {
  it("saves a note from the inline field and opens a saved note for edit", async () => {
    vi.mocked(tripNoteRepository.create).mockResolvedValue({} as never);
    render(<TripNotesBoard tripId="trip-1" userId="user-1" />);

    fireEvent.change(screen.getByLabelText("Write a quick note..."), {
      target: { value: "Happy hour at 8 PM" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));

    await waitFor(() => expect(tripNoteRepository.create).toHaveBeenCalledOnce());
    expect(vi.mocked(tripNoteRepository.create).mock.calls[0]?.[0]).toMatchObject({
      tripId: "trip-1",
      userId: "user-1",
      content: "Happy hour at 8 PM",
    });

    fireEvent.click(screen.getByRole("button", { name: "Edit note: Buffet closes at 12 PM" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(tripNoteRepository.remove).toHaveBeenCalledWith("note-1", "user-1"));
  });
});
