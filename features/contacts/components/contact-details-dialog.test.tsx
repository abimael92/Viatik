import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ContactDetailsDialog } from "@/features/contacts/components/contact-details-dialog";
import type { Contact } from "@/features/domain/entities";

const sampleContact: Contact = {
  id: "c-100",
  ownerId: "u-1",
  fullName: "Elena Lopez",
  avatarUrl: "https://example.com/photo.jpg",
  avatarSeed: null,
  email: "elena@example.com",
  phone: "+1 555 123 4567",
  relationship: "friend",
  travelerType: "adult",
  birthDate: "1992-05-15",
  notes: "Prefers aisle seats and vegan meals.",
  linkedProfileId: "profile-elena",
  linkedAvatarUrl: "https://example.com/photo.jpg",
  linkedHandle: "elenalopez",
  connectionId: "conn-elena",
  connectionStatus: "accepted",
  connectionDirection: null,
  emergencyContactName: "Marco Lopez",
  emergencyContactRelationship: "Brother",
  emergencyContactPhone: "+1 555 987 6543",
  dietaryRestrictions: ["vegan"],
  allergies: ["peanuts"],
  passportIssuingCountry: "US",
  passportExpiresOn: "2030-01-01",
  preferredCurrency: "USD",
  preferredLanguage: "English",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
};

describe("ContactDetailsDialog", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders all details in read-only mode", () => {
    render(
      <ContactDetailsDialog
        open
        contact={sampleContact}
        onOpenChange={vi.fn()}
        onEdit={vi.fn()}
      />
    );

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getAllByText("Elena Lopez").length).toBeGreaterThanOrEqual(1);
    expect(within(dialog).getByText("@elenalopez")).toBeTruthy();
    expect(within(dialog).getByText("elena@example.com")).toBeTruthy();
    expect(within(dialog).getByText("+1 555 123 4567")).toBeTruthy();
    expect(within(dialog).getByText("Marco Lopez")).toBeTruthy();
    expect(within(dialog).getByText("Brother")).toBeTruthy();
    expect(within(dialog).getByText("vegan")).toBeTruthy();
    expect(within(dialog).getByText("peanuts")).toBeTruthy();
    expect(within(dialog).getByText("Prefers aisle seats and vegan meals.")).toBeTruthy();

    // Verify there are no form input fields (everything is read-only text)
    expect(within(dialog).queryByRole("textbox")).toBeNull();
  });

  it("triggers onEdit when Edit Contact button is clicked", () => {
    const onEdit = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <ContactDetailsDialog
        open
        contact={sampleContact}
        onOpenChange={onOpenChange}
        onEdit={onEdit}
      />
    );

    const editBtn = screen.getByRole("button", { name: /Edit Contact/i });
    fireEvent.click(editBtn);

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onEdit).toHaveBeenCalledWith(sampleContact);
  });
});
