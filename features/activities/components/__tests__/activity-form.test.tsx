import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";

import { ActivityForm, defaultEndTime } from "@/features/activities/components/activity-form";

vi.mock("@/app/actions/places", () => ({
  searchActivityPlaces: vi.fn().mockResolvedValue({ suggestions: [], configured: true }),
  getPlaceDetails: vi.fn(),
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: PropsWithChildren) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: PropsWithChildren) => <>{children}</>,
  DropdownMenuContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
  DropdownMenuGroup: ({ children }: PropsWithChildren) => <div>{children}</div>,
  DropdownMenuLabel: ({ children }: PropsWithChildren) => <span>{children}</span>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuItem: ({ children, onSelect }: PropsWithChildren<{ onSelect?: () => void }>) => (
    <button type="button" role="menuitem" onClick={onSelect}>{children}</button>
  ),
}));

describe("ActivityForm", () => {
  it("submits a new activity as a group proposal", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<ActivityForm days={["2026-09-16"]} currentUserId="user-1" saving={false} onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Museum" } });
    fireEvent.click(screen.getByRole("button", { name: /send to group vote/i }));
    fireEvent.submit(container.querySelector("form")!);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      pollStatus: "proposed",
      votingEndsAt: expect.any(String),
      pollOptions: [expect.objectContaining({ label: "Museum", proposedBy: "user-1" })],
      pollVotes: [],
    })));
  });

  it("does not auto-prompt for group vote when a confirmed activity time changes", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const activity = { id: "activity-1", tripId: "trip-1", dayDate: "2026-09-16", title: "Museum", description: null, category: "sightseeing", pollStatus: "confirmed" as const, startTime: "2026-09-16T10:00:00", endTime: "2026-09-16T12:00:00", position: 1, estimatedCostMinor: null, createdBy: "user-1", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", deletedAt: null };
    const { container } = render(<ActivityForm activity={activity} days={["2026-09-16"]} currentUserId="user-1" saving={false} onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Start time"), { target: { value: "11:00" } });
    fireEvent.submit(container.querySelector("form")!);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(confirm).not.toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ pollStatus: "confirmed" }));
    confirm.mockRestore();
  });

  it("shows a quick clone action for an existing activity", () => {
    const activity = { id: "activity-1", tripId: "trip-1", dayDate: "2026-09-16", title: "Museum", description: null, category: "sightseeing", startTime: null, endTime: null, position: 1, estimatedCostMinor: null, createdBy: "user-1", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", deletedAt: null };
    const onClone = vi.fn();
    render(<ActivityForm activity={activity} days={["2026-09-16"]} saving={false} onSubmit={vi.fn()} onCancel={vi.fn()} onClone={onClone} />);
    fireEvent.click(screen.getByRole("button", { name: "Quick clone" }));
    expect(onClone).toHaveBeenCalledOnce();
  });

  it("defaults every trip member to attending", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const timestamp = "2026-01-01T00:00:00Z";
    const members = ["user-1", "user-2"].map((userId, index) => ({ id: `member-${index}`, tripId: "trip-1", userId, role: index === 0 ? "owner" as const : "editor" as const, invitedBy: null, joinedAt: timestamp, roleChangedAt: null, roleChangedBy: null, removedAt: null, removedBy: null, version: 1, createdAt: timestamp, updatedAt: timestamp }));
    const { container } = render(<ActivityForm days={["2026-09-16"]} members={members} profiles={[{ id: "user-2", fullName: "Mika Sato", avatarUrl: "https://example.com/mika.png", avatarSeed: "adventurer|mika", email: null }]} currentUserId="user-1" saving={false} onSubmit={onSubmit} onCancel={vi.fn()} />);

    expect(screen.getByRole("button", { name: /you: going/i }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /mika sato: going/i }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByText("user-2")).toBeNull();
    expect(screen.getByLabelText("Mika Sato")).toBeTruthy();
    fireEvent.submit(container.querySelector("form")!);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ participants: [{ userId: "user-1", travelerId: null, status: "attending" }, { userId: "user-2", travelerId: null, status: "attending" }] })));
  });

  it("deduplicates a linked traveler when the member profile is already listed", () => {
    const members = [{ id: "member-1", tripId: "trip-1", userId: "user-1", role: "owner" as const, invitedBy: null, joinedAt: "2026-01-01T00:00:00Z", roleChangedAt: null, roleChangedBy: null, removedAt: null, removedBy: null, version: 1, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }];
    const travelers = [{ id: "traveler-1", tripId: "trip-1", contactId: "contact-1", displayName: "Alex Chen", travelerType: "adult" as const, createdBy: "user-1", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", deletedAt: null }];
    render(<ActivityForm days={["2026-09-16"]} members={members} profiles={[{ id: "user-1", fullName: "Alex Chen", avatarUrl: null, avatarSeed: "adventurer|alex", email: null }]} travelers={travelers} saving={false} onSubmit={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getAllByText("Alex Chen")).toHaveLength(1);
  });

  it("shows trip travelers and immediately selects a manually added traveler", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onAddTraveler = vi.fn().mockResolvedValue({ id: "traveler-2", tripId: "trip-1", contactId: "contact-2", displayName: "Sam Rivera", travelerType: "adult", createdBy: "user-1", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", deletedAt: null });
    const travelers = [{ id: "traveler-1", tripId: "trip-1", contactId: "contact-1", displayName: "Alex Chen", travelerType: "adult" as const, createdBy: "user-1", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", deletedAt: null }];
    const { container } = render(<ActivityForm days={["2026-09-16"]} travelers={travelers} currentUserId="user-1" saving={false} onSubmit={onSubmit} onCancel={vi.fn()} onAddTraveler={onAddTraveler} />);

    expect(screen.getByRole("button", { name: /alex chen: going/i })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Add traveler manually"), { target: { value: "Sam Rivera" } });
    fireEvent.click(screen.getByRole("button", { name: "Add traveler" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /sam rivera: going/i })).toBeTruthy());
    expect(screen.queryByLabelText("Invite a member")).toBeNull();
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ participants: expect.arrayContaining([
      { userId: null, travelerId: "traveler-1", displayName: "Alex Chen", status: "attending" },
      { userId: null, travelerId: "traveler-2", displayName: "Sam Rivera", status: "attending" },
    ]) })));
  });

  it("calculates category-aware end times", () => {
    expect(defaultEndTime("12:00", "food-and-drink")).toBe("13:30");
    expect(defaultEndTime("09:00", "sightseeing")).toBe("11:00");
    expect(defaultEndTime("20:00", "entertainment")).toBe("22:00");
    expect(defaultEndTime("10:00", "general")).toBe("11:00");
  });

  it("switches exact time fields to flexible periods", () => {
    render(<ActivityForm days={["2026-09-16"]} saving={false} onSubmit={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByLabelText("Start time")).toBeTruthy();
    expect(screen.queryByLabelText("Booking Reference / Confirmation Code")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Flexible" }));

    expect(screen.queryByLabelText("Start time")).toBeNull();
    expect(screen.getByRole("button", { name: /anytime/i })).toBeTruthy();
  });

  it("places a description textarea below title and reveals booking only when enabled", () => {
    render(<ActivityForm days={["2026-09-16"]} saving={false} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    const title = screen.getByLabelText("Title");
    const description = screen.getByLabelText("Description");
    expect(description.tagName).toBe("TEXTAREA");
    expect(title.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByLabelText("Booking Reference / Confirmation Code")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /booking/i }));
    expect(screen.getByLabelText("Booking Reference / Confirmation Code")).toBeTruthy();
  });

  it("submits the signed-in user's optional budget in minor units", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<ActivityForm days={["2026-09-16"]} currentUserId="user-1" currency="USD" saving={false} onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("My budget (optional)"), { target: { value: "125.50" } });
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ personalBudgetMinor: 12550n })));
  });

  it("defaults an exact end time when start time changes", () => {
    render(<ActivityForm days={["2026-09-16"]} saving={false} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("menuitem", { name: /food & drink/i }));
    fireEvent.change(screen.getByLabelText("Start time"), { target: { value: "10:15" } });
    expect((screen.getByLabelText("End time") as HTMLInputElement).value).toBe("11:45");
  });

  it("shows transit fields when Transit is selected", async () => {
    render(
      <ActivityForm
        days={["2026-09-16"]}
        saving={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByLabelText("Title")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /general/i }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /transit/i }));

    expect(screen.queryByLabelText("Title")).toBeNull();
    expect(screen.getByLabelText("Carrier")).toBeTruthy();
    expect(screen.getByLabelText("Flight no.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Departure time"), { target: { value: "08:30" } });
    expect((screen.getByLabelText("Arrival time (optional)") as HTMLInputElement).value).toBe("11:30");
    expect(screen.getByRole("button", { name: "Add transit" })).toBeTruthy();
  });
});