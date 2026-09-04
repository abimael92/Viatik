import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TripDashboard } from "@/features/trips/components/trip-dashboard";
import { tripRepository } from "@/features/trips/data/dexie-trip-repository";

vi.mock("@/features/trips/data/dexie-trip-repository", () => ({
  tripRepository: { watchAll: vi.fn(), create: vi.fn(), update: vi.fn() },
}));
vi.mock("@/features/collaboration/data/dexie-collaboration-repository", () => ({
  collaborationRepository: { watchInvitations: vi.fn((_tripId, callback) => { callback([]); return () => undefined; }) },
}));

vi.mock("next/link", () => ({ default: ({ children, href, ...props }: React.ComponentProps<"a">) => <a href={href} {...props}>{children}</a> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

vi.mock("@/lib/sync/use-sync-status", () => ({
  useSyncStatus: () => ({ status: "idle", pending: 0, lastSyncAt: null, isOnline: true, conflicts: 0 }),
}));

describe("TripDashboard", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it("renders the new traveler empty state", async () => {
    vi.mocked(tripRepository.watchAll).mockImplementation((callback) => { callback([]); return () => undefined; });
    render(<TripDashboard userId="user-1" />);
    expect(await screen.findByText("Your next trip starts here")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create your first trip" })).toBeTruthy();
  });

  it("creates trips through the repository", async () => {
    vi.mocked(tripRepository.watchAll).mockImplementation((callback) => { callback([]); return () => undefined; });
    vi.mocked(tripRepository.create).mockResolvedValue({ id: "trip-1" } as never);
    render(<TripDashboard userId="user-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Create trip" }));
    fireEvent.change(screen.getByLabelText("Trip name"), { target: { value: " Lisbon " } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText("Starts"), { target: { value: "2026-09-15" } });
    fireEvent.change(screen.getByLabelText("Ends"), { target: { value: "2026-09-22" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Next" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Create trip" }));
    await waitFor(() => expect(tripRepository.create).toHaveBeenCalledWith(expect.objectContaining({ ownerId: "user-1", name: "Lisbon", baseCurrency: "USD" })));
  });

  it("keeps the selected cover image in the file input", async () => {
    vi.mocked(tripRepository.watchAll).mockImplementation((callback) => { callback([]); return () => undefined; });
    render(<TripDashboard userId="user-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Create trip" }));
    fireEvent.change(screen.getByLabelText("Trip name"), { target: { value: "Lisbon" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText("Starts"), { target: { value: "2026-09-15" } });
    fireEvent.change(screen.getByLabelText("Ends"), { target: { value: "2026-09-22" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Next" }));
    const input = screen.getByLabelText("Upload cover image") as HTMLInputElement;
    const cover = new File(["cover"], "lisbon.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [cover] } });
    const selectedInput = screen.getByLabelText("Upload cover image") as HTMLInputElement;
    expect(selectedInput).toBe(input);
    expect(selectedInput.files?.[0]).toBe(cover);
    expect(screen.getByText("lisbon.png")).toBeTruthy();
  });

  it("keeps the modal open and explains invalid date ranges", async () => {
    vi.mocked(tripRepository.watchAll).mockImplementation((callback) => { callback([]); return () => undefined; });
    render(<TripDashboard userId="user-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Create trip" }));
    fireEvent.change(screen.getByLabelText("Trip name"), { target: { value: "Las Vegas" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText("Starts"), { target: { value: "2026-09-25" } });
    fireEvent.change(screen.getByLabelText("Ends"), { target: { value: "2026-09-22" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Next" }));
    expect((await screen.findByRole("alert")).textContent).toContain("End date must be on or after the start date.");
    expect(tripRepository.create).not.toHaveBeenCalled();
  });

  it("rejects trips longer than 60 days", async () => {
    vi.mocked(tripRepository.watchAll).mockImplementation((callback) => { callback([]); return () => undefined; });
    render(<TripDashboard userId="user-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Create trip" }));
    fireEvent.change(screen.getByLabelText("Trip name"), { target: { value: "Long Trip" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText("Starts"), { target: { value: "2026-09-01" } });
    fireEvent.change(screen.getByLabelText("Ends"), { target: { value: "2026-10-31" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Next" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Trips can be up to 60 days long.");
    expect(tripRepository.create).not.toHaveBeenCalled();
  });
});
