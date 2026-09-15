import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ContactEditorDialog } from "@/features/contacts/components/contact-editor-dialog";

if (typeof window !== "undefined") {
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  window.PointerEvent ??= class PointerEvent extends MouseEvent {} as unknown as typeof PointerEvent;
}

vi.mock("@/features/contacts/data/dexie-contact-repository", () => ({
  contactRepository: {
    create: vi.fn(),
    update: vi.fn(),
    listUpcomingTrips: vi.fn(),
  },
}));

describe("ContactEditorDialog", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("guides the user through a stepped contact form", () => {
    render(<ContactEditorDialog open userId="user-1" onOpenChange={vi.fn()} />);

    const dialog = screen.getByRole("dialog");
    const steps = within(dialog).getByRole("navigation", { name: "Contact setup progress" });

    // All three steps are announced up front.
    for (const label of ["Identity", "Contact details", "Travel details"]) {
      expect(within(steps).getByText(label)).toBeTruthy();
    }

    // Step 1 — Identity, with the privacy note. Later sections are hidden.
    expect(within(dialog).getByRole("heading", { name: "Identity" })).toBeTruthy();
    expect(within(dialog).getByText(/Only you can see email, phone, birth date, and notes/)).toBeTruthy();
    expect(within(dialog).queryByLabelText("Dietary restrictions")).toBeNull();
    expect(within(dialog).getByRole("button", { name: "Next" })).toBeTruthy();

    // A valid name is required to advance.
    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }));
    expect(within(dialog).getByRole("heading", { name: "Identity" })).toBeTruthy();

    fireEvent.change(within(dialog).getByLabelText("Full name"), { target: { value: "Jordan Rivera" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }));

    // Step 2 — contact + emergency details.
    expect(within(dialog).getByRole("heading", { name: "Contact details" })).toBeTruthy();
    expect(within(dialog).getByRole("heading", { name: "Emergency contact" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Back" })).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }));

    // Step 3 — travel details and the final submit action.
    expect(within(dialog).getByRole("heading", { name: "Travel details" })).toBeTruthy();
    expect(within(dialog).getByLabelText("Dietary restrictions")).toBeTruthy();
    expect(within(dialog).getByLabelText("Allergies")).toBeTruthy();
    expect(within(dialog).getByLabelText("Passport expiration")).toBeTruthy();
    expect(within(dialog).getByText("No passport number is stored.")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Save contact" })).toBeTruthy();
  });

  it("requires completing every step before the final one is reachable", () => {
    render(<ContactEditorDialog open userId="user-1" onOpenChange={vi.fn()} />);
    const dialog = screen.getByRole("dialog");

    // Skipping straight to the final step is blocked until prior steps are visited.
    fireEvent.click(within(dialog).getByRole("button", { name: "Go to step: Travel details" }));
    expect(within(dialog).getByRole("heading", { name: "Identity" })).toBeTruthy();
    expect(within(dialog).getByText(/Complete Contact details before moving on/)).toBeTruthy();

    // Fill the name and advance to step 2, then the final step becomes reachable.
    fireEvent.change(within(dialog).getByLabelText("Full name"), { target: { value: "Jordan Rivera" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }));
    expect(within(dialog).getByRole("heading", { name: "Contact details" })).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "Go to step: Travel details" }));
    expect(within(dialog).getByRole("heading", { name: "Travel details" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Save contact" })).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "Next" })).toBeNull();
  });

  it("preserves manual form state while switching add methods", () => {
    render(
      <ContactEditorDialog
        open
        userId="user-1"
        ownProfile={{ profileId: "user-1", fullName: "Alex Morgan" }}
        onOpenChange={vi.fn()}
      />
    );

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Add Contact" })).toBeTruthy();

    fireEvent.change(within(dialog).getByLabelText("Full name"), {
      target: { value: "Jordan Rivera" },
    });
    fireEvent.mouseDown(within(dialog).getByRole("tab", { name: "Viatik ID" }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.change(within(dialog).getByPlaceholderText(/Enter their Viatik ID/), {
      target: { value: "VTK-EF50869B9DF94913" },
    });
    expect((within(dialog).getByRole("button", { name: "Search" }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.mouseDown(within(dialog).getByRole("tab", { name: "Scan QR" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(within(dialog).getByRole("button", { name: "Start camera" })).toBeTruthy();

    fireEvent.mouseDown(within(dialog).getByRole("tab", { name: "Manual" }), {
      button: 0,
      ctrlKey: false,
    });
    expect((within(dialog).getByLabelText("Full name") as HTMLInputElement).value).toBe("Jordan Rivera");
  });

  it("disables full name and avatar editing when contact is linked to a Viatik account", () => {
    const viatikContact = {
      id: "c-1",
      ownerId: "user-1",
      fullName: "Elena Lopez",
      avatarUrl: "https://example.com/avatar.jpg",
      avatarSeed: null,
      email: "elena@example.com",
      phone: "+1234567890",
      relationship: "friend" as const,
      travelerType: "adult" as const,
      birthDate: "1990-01-01",
      notes: "Friend from college",
      linkedProfileId: "viatik-user-123",
      linkedAvatarUrl: "https://example.com/avatar.jpg",
      linkedHandle: "elenalopez",
      connectionId: "conn-123",
      connectionStatus: "accepted" as const,
      connectionDirection: null,
      emergencyContactName: null,
      emergencyContactRelationship: null,
      emergencyContactPhone: null,
      dietaryRestrictions: [],
      allergies: [],
      passportIssuingCountry: null,
      passportExpiresOn: null,
      preferredCurrency: null,
      preferredLanguage: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      deletedAt: null,
    };

    render(
      <ContactEditorDialog
        open
        userId="user-1"
        contact={viatikContact}
        onOpenChange={vi.fn()}
      />
    );

    const dialog = screen.getByRole("dialog");
    const nameInput = within(dialog).getByLabelText("Full name") as HTMLInputElement;

    // Name is disabled because it is synced from the Viatik registration account
    expect(nameInput.disabled).toBe(true);
    expect(nameInput.value).toBe("Elena Lopez");
    expect(within(dialog).getByText(/Managed by Viatik account · read-only/)).toBeTruthy();

    // Relationship is still editable
    const relationshipSelect = within(dialog).getByLabelText("Relationship") as HTMLSelectElement;
    expect(relationshipSelect.disabled).toBe(false);
  });

  it("allows full editing when contact was created manually", () => {
    const manualContact = {
      id: "c-2",
      ownerId: "user-1",
      fullName: "Manual Friend",
      avatarUrl: null,
      avatarSeed: "adventurer|seed1",
      email: "manual@example.com",
      phone: null,
      relationship: "friend" as const,
      travelerType: "adult" as const,
      birthDate: null,
      notes: null,
      linkedProfileId: null,
      linkedAvatarUrl: null,
      linkedHandle: null,
      connectionId: null,
      connectionStatus: "unverified_offline" as const,
      connectionDirection: null,
      emergencyContactName: null,
      emergencyContactRelationship: null,
      emergencyContactPhone: null,
      dietaryRestrictions: [],
      allergies: [],
      passportIssuingCountry: null,
      passportExpiresOn: null,
      preferredCurrency: null,
      preferredLanguage: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      deletedAt: null,
    };

    render(
      <ContactEditorDialog
        open
        userId="user-1"
        contact={manualContact}
        onOpenChange={vi.fn()}
      />
    );

    const dialog = screen.getByRole("dialog");
    const nameInput = within(dialog).getByLabelText("Full name") as HTMLInputElement;

    // Full name is editable for manual contacts
    expect(nameInput.disabled).toBe(false);
    expect(nameInput.value).toBe("Manual Friend");

    fireEvent.change(nameInput, { target: { value: "Manual Friend Updated" } });
    expect(nameInput.value).toBe("Manual Friend Updated");
  });
});
