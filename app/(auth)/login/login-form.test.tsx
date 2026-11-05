import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { latestBirthDate } from "@/lib/auth/birth-date";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  signInWithPasskey: vi.fn(),
  getUser: vi.fn(),
  maybeSingle: vi.fn(),
  developmentLogin: vi.fn(),
  sendEmailOtp: vi.fn(),
  verifyEmailOtp: vi.fn(),
  loginWithPassword: vi.fn(),
  registerWithPassword: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }) }));
vi.mock("@/app/actions/auth", () => ({
  developmentLogin: mocks.developmentLogin,
  sendEmailOtp: mocks.sendEmailOtp,
  verifyEmailOtp: mocks.verifyEmailOtp,
  loginWithPassword: mocks.loginWithPassword,
  registerWithPassword: mocks.registerWithPassword,
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
    vi.unstubAllEnvs();
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

  it("links to the password reset request", () => {
    render(<LoginForm />);

    expect(screen.getByRole("link", { name: /forgot password/i }).getAttribute("href")).toBe("/forgot-password");
    expect(screen.queryByText("Existing account")).toBeNull();
  });

  it("rejects today's date of birth before creating an account", async () => {
    render(<LoginForm mode="register" />);
    const birthDate = screen.getByLabelText(/date of birth/i);
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    expect(birthDate.getAttribute("max")).toBe(latestBirthDate());
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: "Ada Lovelace" } });
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: "+1 555 012 3456" } });
    fireEvent.change(birthDate, { target: { value: today } });
    fireEvent.submit(birthDate.closest("form")!);

    expect((await screen.findByRole("alert")).textContent).toBe("Date of birth must be before today.");
    expect(mocks.registerWithPassword).not.toHaveBeenCalled();
  });

  it("shows a localized error when password sign-in rejects", async () => {
    mocks.loginWithPassword.mockRejectedValue(new Error("Failed to fetch"));
    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "ada@example.com" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    expect((await screen.findByRole("alert")).textContent).toBe("We couldn't reach the server. Check your connection and try again.");
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("shows an error when password registration rejects", async () => {
    mocks.registerWithPassword.mockRejectedValue(new Error("Failed to fetch"));
    render(<LoginForm mode="register" />);
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: "Ada Lovelace" } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "ada@example.com" } });
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: "+1 555 012 3456" } });
    fireEvent.change(screen.getByLabelText(/date of birth/i), { target: { value: "1990-01-01" } });
    fireEvent.change(screen.getByLabelText("Password *"), { target: { value: "Str0ngPass!9" } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: "Str0ngPass!9" } });
    fireEvent.click(screen.getByRole("button", { name: /create your account/i }));

    expect((await screen.findByRole("alert")).textContent).toBe("We couldn't reach the server. Check your connection and try again.");
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("shows an error when requesting an email code rejects", async () => {
    mocks.sendEmailOtp.mockRejectedValue(new Error("Failed to fetch"));
    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "ada@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /one-time code/i }));

    expect((await screen.findByRole("alert")).textContent).toBe("We couldn't reach the server. Check your connection and try again.");
  });

  it("shows an error when email-code verification rejects", async () => {
    mocks.sendEmailOtp.mockResolvedValue({ success: true, data: undefined });
    mocks.verifyEmailOtp.mockRejectedValue(new Error("Failed to fetch"));
    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "ada@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /one-time code/i }));
    await screen.findByRole("group", { name: /verification code/i });
    for (let index = 1; index <= 8; index += 1) {
      fireEvent.change(screen.getByLabelText(`Digit ${index}`), { target: { value: "1" } });
    }
    fireEvent.click(screen.getByRole("button", { name: /verify and continue/i }));

    expect((await screen.findByRole("alert")).textContent).toBe("We couldn't reach the server. Check your connection and try again.");
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("shows an error when development login rejects", async () => {
    vi.stubEnv("NODE_ENV", "development");
    mocks.developmentLogin.mockRejectedValue(new Error("Failed to fetch"));
    render(<LoginForm />);
    fireEvent.click(screen.getByRole("button", { name: /open development account/i }));

    expect((await screen.findByRole("alert")).textContent).toBe("We couldn't reach the server. Check your connection and try again.");
    vi.unstubAllEnvs();
  });
});
