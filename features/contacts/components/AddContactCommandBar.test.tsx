import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AddContactCommandBar } from "@/features/contacts/components/AddContactCommandBar";

const lookupViatikProfile = vi.hoisted(() => vi.fn());

vi.mock("@/app/actions/contacts", () => ({ lookupViatikProfile }));
vi.mock("@/features/contacts/data/dexie-contact-repository", () => ({
  contactRepository: { sendConnectionRequest: vi.fn() },
}));

describe("AddContactCommandBar", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows the matched profile after entering a valid Viatik ID", async () => {
    lookupViatikProfile.mockResolvedValue({
      success: true,
      profile: {
        profileId: "profile-2",
        viatikId: "VTK-EF50869B9DF94913",
        fullName: "Jordan Rivera",
        avatarUrl: null,
        avatarSeed: "jordan",
        publicHandle: null,
        preferredCurrency: null,
        preferredLanguage: null,
      },
    });

    render(
      <AddContactCommandBar
        open
        onOpenChange={vi.fn()}
        userId="profile-1"
        ownProfile={{ profileId: "profile-1", fullName: "Alex Morgan" }}
      />
    );

    fireEvent.change(screen.getByLabelText("Viatik ID"), {
      target: { value: "VTK-EF50869B9DF94913" },
    });

    expect(await screen.findByLabelText("Matched Viatik account")).toBeTruthy();
    expect(screen.getByText("Jordan Rivera")).toBeTruthy();
    expect(screen.getByText("VTK-EF50869B9DF94913")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send request" })).toBeTruthy();
  });
});
