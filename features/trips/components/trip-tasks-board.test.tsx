import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TripMember } from "@/features/domain/entities";
import { TripTasksBoard } from "@/features/trips/components/trip-tasks-board";
import { tripTaskRepository } from "@/features/trips/data/dexie-trip-task-repository";
import { collaborationRepository } from "@/features/collaboration/data/dexie-collaboration-repository";

const openTask = {
  id: "task-1",
  tripId: "trip-1",
  creatorId: "user-1",
  assigneeId: null,
  title: "Find the airport bus",
  description: "Night route",
  resolutionText: null,
  status: "open" as const,
  attachments: [],
  createdBy: "user-1",
  updatedBy: "user-1",
  deletedBy: null,
  version: 1,
  createdAt: "2026-09-27T12:00:00.000Z",
  updatedAt: "2026-09-27T12:00:00.000Z",
  deletedAt: null,
};

const member = {
  userId: "user-1",
  role: "owner",
} as TripMember;

vi.mock("@/features/trips/data/dexie-trip-task-repository", () => ({
  tripTaskRepository: {
    watchByTrip: vi.fn((_tripId: string, onChange: (tasks: unknown[]) => void) => {
      onChange([openTask]);
      return () => {};
    }),
    create: vi.fn(),
    resolve: vi.fn(),
  },
}));

vi.mock("@/features/collaboration/data/dexie-collaboration-repository", () => ({
  collaborationRepository: {
    watchMembers: vi.fn((_tripId: string, onChange: (members: TripMember[]) => void) => {
      onChange([member]);
      return () => {};
    }),
    listProfiles: vi.fn(async () => [{ id: "user-1", fullName: "Ada", avatarUrl: null, email: null }]),
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
  storeTaskImages: vi.fn(async () => []),
  mediaIdFromStoragePath: (path: string) => path.split("/").pop()?.replace(/\.[a-z0-9]+$/i, "") ?? null,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TripTasksBoard", () => {
  it("creates a research task and resolves it from the open list", async () => {
    vi.mocked(tripTaskRepository.create).mockResolvedValue(openTask);
    vi.mocked(tripTaskRepository.resolve).mockResolvedValue({ ...openTask, status: "resolved", resolutionText: "Bus 42" });
    render(<TripTasksBoard tripId="trip-1" userId="user-1" />);

    expect(screen.getByRole("heading", { name: "Open" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Resolved" })).toBeTruthy();

    await waitFor(() => expect(collaborationRepository.listProfiles).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Book a Zoox" } });
    fireEvent.click(screen.getByRole("button", { name: "Research" }));

    await waitFor(() => expect(tripTaskRepository.create).toHaveBeenCalledOnce());
    expect(vi.mocked(tripTaskRepository.create).mock.calls[0]?.[0]).toMatchObject({
      tripId: "trip-1",
      creatorId: "user-1",
      title: "Book a Zoox",
      assigneeId: null,
    });

    fireEvent.click(screen.getByRole("button", { name: /Find the airport bus/ }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("How it was resolved"), { target: { value: "Bus 42 from the plaza" } });
    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
    await waitFor(() =>
      expect(tripTaskRepository.resolve).toHaveBeenCalledWith(
        "task-1",
        "user-1",
        "Bus 42 from the plaza",
        [],
      ),
    );
  });
});
