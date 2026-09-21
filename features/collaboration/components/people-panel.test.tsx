import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PeoplePanel } from "@/features/collaboration/components/people-panel";
import { collaborationRepository } from "@/features/collaboration/data/dexie-collaboration-repository";
import { contactRepository, tripTravelerRepository } from "@/features/contacts/data/dexie-contact-repository";
import type { ProfileSummary, TripMember } from "@/features/domain/entities";

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

    screen.getByRole("button", { name: "Edit relationship for Alex Traveler" }).click();
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

    screen.getByRole("button", { name: "Edit traveler for Mom" }).click();
    expect((await screen.findByRole("dialog")).textContent).toContain("Editing Mom (general)");
  });

  it("shows Viatik members even when they have no traveler contact row", async () => {
    render(<PeoplePanel tripId="trip-1" userId="user-1" canEdit={false} />);

    expect(await screen.findByText("Alex Traveler")).toBeTruthy();
    expect(screen.getAllByText("Viatik account").length).toBeGreaterThan(1);
    expect(screen.getByText("editor")).toBeTruthy();
  });
});
