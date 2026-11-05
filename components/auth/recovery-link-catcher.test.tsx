import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setSession: vi.fn(),
  grantPasswordRecovery: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("@/app/actions/auth", () => ({
  grantPasswordRecovery: mocks.grantPasswordRecovery,
}));
vi.mock("@/lib/supabase/browser-client", () => ({
  getSupabaseBrowserClient: () => ({ auth: { setSession: mocks.setSession } }),
}));

import { RecoveryLinkCatcher } from "@/components/auth/recovery-link-catcher";

const originalLocation = window.location;

describe("RecoveryLinkCatcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        hash: "#type=recovery&access_token=access&refresh_token=refresh",
        replace: mocks.replace,
      },
    });
  });

  afterEach(() => {
    cleanup();
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  });

  it("routes to the reset form after recovery authorization succeeds", async () => {
    mocks.setSession.mockResolvedValue({ error: null });
    mocks.grantPasswordRecovery.mockResolvedValue({ success: true });
    render(<RecoveryLinkCatcher />);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/reset-password"));
  });

  it("routes to the invalid-link fallback when setting the session rejects", async () => {
    mocks.setSession.mockRejectedValue(new Error("network failure"));
    render(<RecoveryLinkCatcher />);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith(
      "/login?error=That%20email%20link%20is%20invalid%20or%20expired.%20Request%20a%20new%20one."
    ));
  });

  it("routes to the invalid-link fallback when recovery completion rejects", async () => {
    mocks.setSession.mockResolvedValue({ error: null });
    mocks.grantPasswordRecovery.mockRejectedValue(new Error("network failure"));
    render(<RecoveryLinkCatcher />);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith(
      "/login?error=That%20email%20link%20is%20invalid%20or%20expired.%20Request%20a%20new%20one."
    ));
  });
});
