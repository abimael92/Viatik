import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PeoplePanel } from "@/features/collaboration/components/people-panel";
import { collaborationRepository } from "@/features/collaboration/data/dexie-collaboration-repository";
import { contactRepository, tripTravelerRepository } from "@/features/contacts/data/dexie-contact-repository";
import type { ProfileSummary, TripMember } from "@/features/domain/entities";
import { tripRepository } from "@/features/trips/data/dexie-trip-repository";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock("@/features/collaboration/data/dexie-collaboration-repository", () => ({
  collaborationRepository: {
    watchMembers: vi.fn(),
    watchInvitations: vi.fn(),
    listProfiles: vi.fn(),
  },
}));
vi.mock("@/features/contacts/data/dexie-contact-repository", () => ({
  contactRepository: { watch: vi.fn() },
  tripTravelerRepository: { watch: vi.fn() },
}));
vi.mock("@/features/trips/data/dexie-trip-repository", () => ({
  tripRepository: { watchById: vi.fn(), update: vi.fn() },
}));
vi.mock("@/features/contacts/components/contact-editor-dialog", () => ({
  ContactEditorDialog: ({ open, contact, relationshipOnly }: { open: boolean; contact?: { fullName: string } | null; relationshipOnly?: boolean }) =>
    open ? <div role="dialog">Editing {contact?.fullName} ({relationshipOnly ? "relationship" : "general"})</div> : null,
}));

describe("PeoplePanel", () => {
  const member: TripMember = {
    id: "member-1",
    tripId: "trip-1",
    userId: "user-2",
    role: "editor",
    invitedBy: "user-1",
    joinedAt: "2026-01-01T00:00:00.000Z",
    roleChangedAt: null,
    roleChangedBy: null,
    removedAt: null,
    removedBy: null,
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const profile: ProfileSummary = {
    id: "user-2",
    fullName: "Alex Traveler",
    avatarUrl: null,
    avatarSeed: "adventurer|alex",
    email: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tripRepository.watchById).mockImplementation((_tripId, callback) => {
      callback({ crewConfirmed: false, packingConfirmed: false } as never);
      return () => undefined;
    });
    vi.mocked(tripRepository.update).mockResolvedValue({} as never);
    vi.mocked(contactRepository.watch).mockImplementation((_userId, callback) => {
      callback([]);
      return () => undefined;
    });
    vi.mocked(tripTravelerRepository.watch).mockImplementation((_tripId, callback) => {
      callback([]);
      return () => undefined;
    });
    vi.mocked(collaborationRepository.watchMembers).mockImplementation((_tripId, callback) => {
      callback([member]);
      return () => undefined;
    });
    vi.mocked(collaborationRepository.watchInvitations).mockImplementation((_tripId, callback) => {
      callback([]);
      return () => undefined;
    });
    vi.mocked(collaborationRepository.listProfiles).mockResolvedValue([profile]);
  });

  afterEach(() => cleanup());

  it("allows editing the relationship metadata for a linked Viatik traveler", async () => {
    const linkedContact = { id: "contact-1", ownerId: "user-1", fullName: "Alex Traveler", linkedProfileId: "user-2" };
    const linkedTraveler = { id: "traveler-1", tripId: "trip-1", contactId: "contact-1", displayName: "Alex Traveler", travelerType: "adult", createdBy: "user-1" };
    vi.mocked(contactRepository.watch).mockImplementation((_userId, callback) => {
      callback([linkedContact as never]);
      return () => undefined;
    });
    vi.mocked(tripTravelerRepository.watch).mockImplementation((_tripId, callback) => {
      callback([linkedTraveler as never]);
      return () => undefined;
    });

    render(<PeoplePanel tripId="trip-1" userId="user-1" canEdit />);
    await waitFor(() => expect(collaborationRepository.listProfiles).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Edit relationship for Alex Traveler" }));
    expect((await screen.findByRole("dialog")).textContent).toContain("Editing Alex Traveler");
  });

  it("allows editing general data for a manual traveler from the People tab", async () => {
    const manualContact = { id: "contact-manual", ownerId: "user-1", fullName: "Mom", linkedProfileId: null };
    const manualTraveler = { id: "traveler-manual", tripId: "trip-1", contactId: "contact-manual", displayName: "Mom", travelerType: "adult", createdBy: "user-1" };
    vi.mocked(contactRepository.watch).mockImplementation((_userId, callback) => {
      callback([manualContact as never]);
      return () => undefined;
    });
    vi.mocked(tripTravelerRepository.watch).mockImplementation((_tripId, callback) => {
      callback([manualTraveler as never]);
      return () => undefined;
    });

    render(<PeoplePanel tripId="trip-1" userId="user-1" canEdit />);
    await waitFor(() => expect(collaborationRepository.listProfiles).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Edit traveler for Mom" }));
    expect((await screen.findByRole("dialog")).textContent).toContain("Editing Mom (general)");
  });

  it("toggles crew confirmation through the trip repository", async () => {
    render(<PeoplePanel tripId="trip-1" userId="user-1" canEdit />);
    await waitFor(() => expect(collaborationRepository.listProfiles).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Set as crew confirmed" }));
    await waitFor(() => expect(tripRepository.update).toHaveBeenCalledWith("trip-1", { crewConfirmed: true }));
  });

  it("shows Viatik members even when they have no traveler contact row", async () => {
    render(<PeoplePanel tripId="trip-1" userId="user-1" canEdit={false} />);
    await waitFor(() => expect(collaborationRepository.listProfiles).toHaveBeenCalled());

    expect(await screen.findByText("Alex Traveler")).toBeTruthy();
    expect(screen.getAllByText("Viatik account").length).toBe(1);
    expect(screen.getByText("editor")).toBeTruthy();
    expect(screen.getByText("Crew status").closest(".overflow-hidden")?.textContent).toContain("Alex Traveler");
  });
});
