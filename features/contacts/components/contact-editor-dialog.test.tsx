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

  it("jumps directly to a later step from the clickable progress header", async () => {
    render(<ContactEditorDialog open userId="user-1" onOpenChange={vi.fn()} />);
    const dialog = screen.getByRole("dialog");

    // Filling the required name lets us jump straight to the final step.
    fireEvent.change(within(dialog).getByLabelText("Full name"), { target: { value: "Jordan Rivera" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Go to step: Travel details" }));

    expect(within(dialog).getByRole("heading", { name: "Travel details" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Save contact" })).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "Next" })).toBeNull();
  });
});
