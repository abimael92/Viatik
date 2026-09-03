import { cleanup, render, screen, within } from "@testing-library/react";
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

  it("groups contact fields into a clear single-page form", () => {
    render(
      <ContactEditorDialog
        open
        userId="user-1"
        onOpenChange={vi.fn()}
      />
    );

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "New contact" })).toBeTruthy();
    expect(within(dialog).getByRole("heading", { name: "Identity" })).toBeTruthy();
    expect(within(dialog).getByRole("heading", { name: "Contact details" })).toBeTruthy();
    expect(within(dialog).getByRole("heading", { name: "Emergency contact" })).toBeTruthy();
    expect(within(dialog).getByRole("heading", { name: "Travel details" })).toBeTruthy();
    expect(within(dialog).getByText(/Only you can see email, phone, birth date, and notes/)).toBeTruthy();
    expect(within(dialog).getByLabelText("Dietary restrictions")).toBeTruthy();
    expect(within(dialog).getByLabelText("Allergies")).toBeTruthy();
    expect(within(dialog).getByLabelText("Passport expiration")).toBeTruthy();
    expect(within(dialog).getByText("No passport number is stored.")).toBeTruthy();
    expect(dialog.querySelectorAll("form")).toHaveLength(1);
    expect(within(dialog).getByRole("button", { name: "Save contact" })).toBeTruthy();
  });
});
