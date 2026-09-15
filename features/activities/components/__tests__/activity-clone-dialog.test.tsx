import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ActivityCloneDialog } from "@/features/activities/components/activity-clone-dialog";
import type { Activity } from "@/features/domain/entities";

const baseActivity: Activity = {
  id: "activity-1",
  tripId: "trip-1",
  dayDate: "2026-09-16",
  title: "Museum",
  description: null,
  category: "sightseeing",
  timingSpecificity: "exact",
  flexiblePeriod: null,
  startTime: "2026-09-16T10:00:00",
  endTime: "2026-09-16T12:00:00",
  position: 1,
  estimatedCostMinor: null,
  createdBy: "user-1",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  deletedAt: null,
};

describe("ActivityCloneDialog", () => {
  it("defaults to the next trip day and submits exact timing", async () => {
    const onClone = vi.fn().mockResolvedValue(undefined);
    render(<ActivityCloneDialog activity={baseActivity} days={["2026-09-16", "2026-09-17"]} open cloning={false} onOpenChange={vi.fn()} onClone={onClone} />);

    expect((screen.getByLabelText("Date") as HTMLSelectElement).value).toBe("2026-09-17");
    fireEvent.change(screen.getByLabelText("Start time"), { target: { value: "14:30" } });
    fireEvent.change(screen.getByLabelText("End time"), { target: { value: "16:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Clone activity" }));

    await waitFor(() => expect(onClone).toHaveBeenCalledWith({ dayDate: "2026-09-17", startTime: "2026-09-17T14:30:00", endTime: "2026-09-17T16:30:00", flexiblePeriod: null }));
  });

  it("allows a new period for flexible clones", async () => {
    const onClone = vi.fn().mockResolvedValue(undefined);
    render(<ActivityCloneDialog activity={{ ...baseActivity, timingSpecificity: "flexible", flexiblePeriod: "morning", startTime: null, endTime: null }} days={["2026-09-16"]} open cloning={false} onOpenChange={vi.fn()} onClone={onClone} />);
    fireEvent.click(screen.getByRole("button", { name: "evening" }));
    fireEvent.click(screen.getByRole("button", { name: "Clone activity" }));
    await waitFor(() => expect(onClone).toHaveBeenCalledWith({ dayDate: "2026-09-16", startTime: null, endTime: null, flexiblePeriod: "evening" }));
  });
});
