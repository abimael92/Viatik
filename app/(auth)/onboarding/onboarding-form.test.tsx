import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  completeOnboarding: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));
vi.mock("@/app/actions/auth", () => ({
  completeOnboarding: mocks.completeOnboarding,
}));

import { OnboardingForm } from "@/app/(auth)/onboarding/onboarding-form";

describe("OnboardingForm", () => {
  it("advances on Next and only submits after every screen", () => {
    render(<OnboardingForm email="ada@example.com" next="/home" />);

    expect(screen.queryByRole("button", { name: "Submit" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Ada Lovelace" } });
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "+1 555 012 3456" } });
    fireEvent.submit(document.querySelector("form")!);

    expect(mocks.completeOnboarding).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Emergency contact" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Submit" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: "Travel details" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Submit" })).toBeTruthy();
    expect(mocks.completeOnboarding).not.toHaveBeenCalled();
  });

  it("shows a localized error and does not redirect when onboarding rejects", async () => {
    mocks.completeOnboarding.mockRejectedValue(new Error("Failed to fetch"));
    render(<OnboardingForm email="ada@example.com" next="/home" />);
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Ada Lovelace" } });
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "+1 555 012 3456" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText("Date of birth"), { target: { value: "1990-01-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect((await screen.findByRole("alert")).textContent).toBe("We couldn't reach the server. Check your connection and try again.");
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Submit" })).toBeTruthy();
  });
});
