import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  signInWithPasskey: vi.fn(),
  getUser: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }) }));
vi.mock("@/app/actions/auth", () => ({
  developmentLogin: vi.fn(),
  sendEmailOtp: vi.fn(),
  verifyEmailOtp: vi.fn(),
}));
vi.mock("@/lib/supabase/browser-client", () => ({
  getSupabaseBrowserClient: () => ({
    auth: { signInWithPasskey: mocks.signInWithPasskey, getUser: mocks.getUser },
    from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: mocks.maybeSingle })) })) })),
  }),
}));

import { LoginForm } from "@/app/(auth)/login/login-form";

describe("native passkey login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mocks.maybeSingle.mockResolvedValue({ data: { full_name: "Alice" }, error: null });
  });

  it("requires and verifies a Supabase session before redirecting", async () => {
    mocks.signInWithPasskey.mockResolvedValue({ data: { user: { id: "user-1" }, session: { access_token: "token" } }, error: null });
    render(<LoginForm next="/trips" />);

    fireEvent.click(screen.getByRole("button", { name: /sign in with a passkey/i }));

    await waitFor(() => expect(mocks.getUser).toHaveBeenCalledOnce());
    expect(mocks.replace).toHaveBeenCalledWith("/trips");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("does not redirect when Supabase does not issue a session", async () => {
    mocks.signInWithPasskey.mockResolvedValue({ data: { user: { id: "user-1" }, session: null }, error: null });
    render(<LoginForm />);

    fireEvent.click(screen.getByRole("button", { name: /sign in with a passkey/i }));

    expect((await screen.findByRole("alert")).textContent).toBe("Passkey sign-in did not create a session.");
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
