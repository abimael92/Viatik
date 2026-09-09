import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  registerPasskey: vi.fn(),
  updateProfile: vi.fn(),
  updateProfileDetails: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/app/actions/auth", () => ({ updateProfile: mocks.updateProfile, updateProfileDetails: mocks.updateProfileDetails }));
vi.mock("@/lib/supabase/browser-client", () => ({
  getSupabaseBrowserClient: () => ({ auth: { registerPasskey: mocks.registerPasskey } }),
}));

import { SettingsClient } from "@/app/(app)/settings/settings-client";

describe("native passkey registration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports success only after Supabase persists a passkey", async () => {
    mocks.registerPasskey.mockResolvedValue({ data: { id: "passkey-1" }, error: null });
    render(<SettingsClient phone={null} fullName="Alice" />);

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Security" }));
    fireEvent.click(screen.getByRole("button", { name: "Add passkey" }));

    await waitFor(() => expect(mocks.registerPasskey).toHaveBeenCalledOnce());
    expect((await screen.findByRole("status")).textContent).toBe("Passkey added to your account.");
  });

  it("shows the user's Viatik ID and QR code when present", () => {
    const { container } = render(<SettingsClient phone={null} fullName="Alice" viatikId="VTK-1234ABCD5678EF90" />);

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Directory" }));
    expect(screen.getByText("VTK-1234ABCD5678EF90")).toBeTruthy();
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("displays saved profile details read-only until edit is pressed", () => {
    render(
      <SettingsClient
        phone={null}
        fullName="Alice"
        profile={{ fullName: "Alice", phone: "+1 555 0100", birthDate: "1990-01-01", dietaryRestrictions: ["vegetarian"] }}
      />
    );
    expect(screen.getAllByText("Alice").length).toBeGreaterThan(0);
    expect(screen.getAllByText("+1 555 0100").length).toBeGreaterThan(0);
    expect(screen.getByText("vegetarian")).toBeTruthy();
    expect(screen.queryByLabelText("Full name")).toBeNull();
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
  });

  it("edits profile details through the server action", async () => {
    mocks.updateProfileDetails.mockResolvedValue({ success: true, data: undefined });
    mocks.refresh.mockImplementation(() => undefined);
    render(<SettingsClient phone={null} fullName="Alice" />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Alicia" } });
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "+1 555 0100" } });
    fireEvent.change(screen.getByLabelText("Date of birth"), { target: { value: "1990-01-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => expect(mocks.updateProfileDetails).toHaveBeenCalled());
    expect(mocks.updateProfileDetails.mock.calls[0][0].fullName).toBe("Alicia");
    expect(mocks.refresh).toHaveBeenCalled();
  });
});
