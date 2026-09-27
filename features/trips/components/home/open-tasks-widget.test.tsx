import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TripMember } from "@/features/domain/entities";
import { OpenTasksWidget } from "@/features/trips/components/home/open-tasks-widget";
import { tripTaskRepository } from "@/features/trips/data/dexie-trip-task-repository";
import type { TripTask } from "@/features/trips/domain/trip-task";

const openTask: TripTask = {
  id: "task-1",
  tripId: "trip-1",
  creatorId: "user-1",
  assigneeId: "user-2",
  title: "Book a Zoox",
  description: null,
  resolutionText: null,
  status: "open",
  attachments: [],
  createdBy: "user-1",
  updatedBy: "user-1",
  deletedBy: null,
  version: 1,
  createdAt: "2026-09-27T12:00:00.000Z",
  updatedAt: "2026-09-27T12:00:00.000Z",
  deletedAt: null,
};

vi.mock("@/features/trips/data/dexie-trip-task-repository", () => ({
  tripTaskRepository: {
    watchByTrip: vi.fn((_tripId: string, onChange: (tasks: unknown[]) => void) => {
      onChange([openTask]);
      return () => {};
    }),
    resolve: vi.fn(),
  },
}));

vi.mock("@/features/collaboration/data/dexie-collaboration-repository", () => ({
  collaborationRepository: {
    watchMembers: vi.fn((_tripId: string, onChange: (members: TripMember[]) => void) => {
      onChange([{ userId: "user-1", role: "editor" } as TripMember]);
      return () => {};
    }),
    listProfiles: vi.fn(async () => [{ id: "user-2", fullName: "Kai", avatarUrl: null, email: null }]),
  },
}));

vi.mock("@/features/media/data/dexie-media-repository", () => ({
  mediaRepository: {
    watchByIds: vi.fn((_ids: string[], onChange: (media: unknown[]) => void) => {
      onChange([]);
      return () => {};
    }),
  },
}));

vi.mock("@/features/trips/lib/task-attachments", () => ({
  storeTaskImages: vi.fn(async () => ["trip-1/shot.jpg"]),
  mediaIdFromStoragePath: () => null,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("OpenTasksWidget", () => {
  it("opens a task in place and resolves it without leaving the dashboard", async () => {
    vi.mocked(tripTaskRepository.resolve).mockResolvedValue({ ...openTask, status: "resolved" });
    render(<OpenTasksWidget tripId="trip-1" userId="user-1" />);

    fireEvent.click(screen.getByRole("button", { name: /Book a Zoox/ }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("dialog").textContent).toContain("Assigned to");
    fireEvent.change(screen.getByLabelText("How it was resolved"), { target: { value: "Confirmed for 7 PM" } });
    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));

    await waitFor(() =>
      expect(tripTaskRepository.resolve).toHaveBeenCalledWith("task-1", "user-1", "Confirmed for 7 PM", []),
    );
  });

  it("starts a blank resolution for each task and closes when that task leaves the open list", async () => {
    const second = { ...openTask, id: "task-2", title: "Pack the charger" };
    let publish: (tasks: TripTask[]) => void = () => undefined;
    vi.mocked(tripTaskRepository.watchByTrip).mockImplementation((_tripId, onChange) => {
      publish = onChange as (tasks: TripTask[]) => void;
      onChange([openTask, second]);
      return () => undefined;
    });
    render(<OpenTasksWidget tripId="trip-1" userId="user-1" />);

    fireEvent.click(screen.getByRole("button", { name: /Book a Zoox/ }));
    fireEvent.change(screen.getByLabelText("How it was resolved"), { target: { value: "Draft note" } });
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));

    fireEvent.click(screen.getByRole("button", { name: /Pack the charger/ }));
    expect(screen.getByLabelText("How it was resolved")).toHaveProperty("value", "");

    act(() => {
      publish([openTask, { ...second, status: "resolved" }]);
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
