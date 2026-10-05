import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  registerPasskey: vi.fn(),
  updateProfile: vi.fn(),
  updateProfileDetails: vi.fn(),
  getConnectionQrPayload: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/app/actions/connections", () => ({ getConnectionQrPayload: mocks.getConnectionQrPayload }));
vi.mock("@/app/actions/auth", () => ({ updateProfile: mocks.updateProfile, updateProfileDetails: mocks.updateProfileDetails }));
vi.mock("@/app/actions/profile", () => ({ setWhatsAppNotifications: vi.fn() }));
vi.mock("@/lib/supabase/browser-client", () => ({
  getSupabaseBrowserClient: () => ({ auth: { registerPasskey: mocks.registerPasskey } }),
}));
vi.mock("@/components/ui/avatar-picker", () => ({
  AvatarPicker: ({ onChange }: { onChange: (change: { seed: string }) => void }) => (
    <button type="button" onClick={() => onChange({ seed: "adventurer|selected" })}>Set avatar</button>
  ),
}));

import { SettingsClient } from "@/app/(app)/settings/settings-client";

describe("native passkey registration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports success only after Supabase persists a passkey", async () => {
    mocks.registerPasskey.mockResolvedValue({ data: { id: "passkey-1" }, error: null });
    render(<SettingsClient fullName="Alice" />);

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Security" }));
    fireEvent.click(screen.getByRole("button", { name: "Add passkey" }));

    await waitFor(() => expect(mocks.registerPasskey).toHaveBeenCalledOnce());
    expect((await screen.findByRole("status")).textContent).toBe("Passkey added to your account.");
    expect(screen.queryByText("SMS authentication")).toBeNull();
    expect(screen.queryByText("Verified session")).toBeNull();
  });

  it("shows the user's Viatik ID and signed QR code when present", async () => {
    mocks.getConnectionQrPayload.mockResolvedValue({
      success: true,
      qrValue: "viatik-scan:signed-token",
      token: "signed-token",
      viatikId: "VTK-1234ABCD5678EF90",
      expiresAt: "2026-09-21T21:00:00.000Z",
    });
    const { container } = render(<SettingsClient fullName="Alice" viatikId="VTK-1234ABCD5678EF90" />);

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Directory" }));
    expect(screen.getByText("VTK-1234ABCD5678EF90")).toBeTruthy();
    await waitFor(() => expect(container.querySelector("svg")).toBeTruthy());
    expect(mocks.getConnectionQrPayload).toHaveBeenCalledOnce();
  });

  it("displays saved profile details read-only until edit is pressed", () => {
    render(
      <SettingsClient
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

  it("shows the WhatsApp opt-in on the profile tab with the saved state", () => {
    render(<SettingsClient fullName="Alice" whatsAppNotificationsEnabled />);

    expect(screen.getByRole("switch", { name: "WhatsApp notifications" }).getAttribute("aria-checked")).toBe("true");
  });

  it("edits profile details through the server action", async () => {
    mocks.updateProfileDetails.mockResolvedValue({ success: true, data: undefined });
    mocks.refresh.mockImplementation(() => undefined);
    render(<SettingsClient fullName="Alice" />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Alicia" } });
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "+1 555 0100" } });
    fireEvent.change(screen.getByLabelText("Date of birth"), { target: { value: "1990-01-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Set avatar" }));
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => expect(mocks.updateProfileDetails).toHaveBeenCalled());
    expect(mocks.updateProfileDetails.mock.calls[0][0].fullName).toBe("Alicia");
    expect(mocks.updateProfileDetails.mock.calls[0][0].avatarSeed).toBe("adventurer|selected");
    expect(mocks.refresh).toHaveBeenCalled();
  });
});
