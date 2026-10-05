import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ setWhatsAppNotifications: vi.fn() }));

vi.mock("@/app/actions/profile", () => ({ setWhatsAppNotifications: mocks.setWhatsAppNotifications }));

import { WhatsAppNotificationsCard } from "@/app/(app)/settings/whatsapp-notifications-card";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function toggle() {
  return screen.getByRole("switch", { name: "WhatsApp notifications" });
}

describe("WhatsAppNotificationsCard", () => {
  it("is off by default and explains which phone number is used", () => {
    render(<WhatsAppNotificationsCard initialEnabled={false} />);

    expect(toggle().getAttribute("aria-checked")).toBe("false");
    expect(toggle().getAttribute("aria-describedby")).toBe("whatsapp-notifications-disclaimer");
    expect(screen.getByText(/traveler contact cards linked to your account/)).toBeTruthy();
    expect(screen.getByText(/not the phone in your profile/)).toBeTruthy();
  });

  it("opts in through the server action", async () => {
    mocks.setWhatsAppNotifications.mockResolvedValue({ success: true, data: { enabled: true } });
    render(<WhatsAppNotificationsCard initialEnabled={false} />);

    await act(async () => fireEvent.click(toggle()));

    expect(mocks.setWhatsAppNotifications).toHaveBeenCalledWith(true);
    expect(toggle().getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("status").textContent).toBe("WhatsApp notifications are on.");
  });

  it("opts out", async () => {
    mocks.setWhatsAppNotifications.mockResolvedValue({ success: true, data: { enabled: false } });
    render(<WhatsAppNotificationsCard initialEnabled />);

    await act(async () => fireEvent.click(toggle()));

    expect(mocks.setWhatsAppNotifications).toHaveBeenCalledWith(false);
    expect(toggle().getAttribute("aria-checked")).toBe("false");
  });

  it("reverts and explains when saving fails", async () => {
    mocks.setWhatsAppNotifications.mockResolvedValue({
      success: false,
      error: "We couldn't update your WhatsApp preference. Try again.",
    });
    render(<WhatsAppNotificationsCard initialEnabled={false} />);

    await act(async () => fireEvent.click(toggle()));

    await waitFor(() => expect(toggle().getAttribute("aria-checked")).toBe("false"));
    expect(screen.getByRole("alert").textContent).toBe("We couldn't update your WhatsApp preference. Try again.");
  });

  it("reverts when the request throws", async () => {
    mocks.setWhatsAppNotifications.mockRejectedValue(new Error("offline"));
    render(<WhatsAppNotificationsCard initialEnabled />);

    await act(async () => fireEvent.click(toggle()));

    expect(toggle().getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});
