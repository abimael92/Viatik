import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requestPasswordReset: vi.fn(),
}));

vi.mock("@/app/actions/auth", () => ({
  requestPasswordReset: mocks.requestPasswordReset,
}));

import { ForgotPasswordForm } from "@/app/(auth)/forgot-password/forgot-password-form";

describe("ForgotPasswordForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a generic confirmation that does not claim the account exists", async () => {
    mocks.requestPasswordReset.mockResolvedValue({ success: true, data: undefined });
    render(<ForgotPasswordForm />);

    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "ada@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    expect(await screen.findByRole("heading", { name: /check your email/i })).toBeTruthy();
    expect(screen.getByText(/if an account exists/i)).toBeTruthy();
    expect(mocks.requestPasswordReset).toHaveBeenCalledWith("ada@example.com");
  });

  it("shows the server error when the link cannot be sent", async () => {
    mocks.requestPasswordReset.mockResolvedValue({ success: false, error: "Enter a valid email address." });
    render(<ForgotPasswordForm />);

    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "ada@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    expect((await screen.findByRole("alert")).textContent).toBe("Enter a valid email address.");
  });
});
