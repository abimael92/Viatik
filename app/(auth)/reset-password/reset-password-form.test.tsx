import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  updatePassword: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }) }));
vi.mock("@/app/actions/auth", () => ({ updatePassword: mocks.updatePassword }));

import { ResetPasswordForm } from "@/app/(auth)/reset-password/reset-password-form";

describe("ResetPasswordForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("asks for a new link when the recovery session is missing", () => {
    render(<ResetPasswordForm canReset={false} />);

    expect(screen.getByRole("heading", { name: /this reset link isn't valid/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /request a new link/i }).getAttribute("href")).toBe("/forgot-password");
    expect(screen.queryByLabelText(/new password/i)).toBeNull();
  });

  it("saves a matching password and continues home", async () => {
    mocks.updatePassword.mockResolvedValue({ success: true, data: undefined });
    render(<ResetPasswordForm canReset />);

    fireEvent.change(screen.getByLabelText(/^new password$/i), { target: { value: "Str0ngPass!9" } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: "Str0ngPass!9" } });
    fireEvent.click(screen.getByRole("button", { name: /save new password/i }));

    await waitFor(() => expect(mocks.updatePassword).toHaveBeenCalledWith("Str0ngPass!9"));
    expect(mocks.replace).toHaveBeenCalledWith("/home");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
});
