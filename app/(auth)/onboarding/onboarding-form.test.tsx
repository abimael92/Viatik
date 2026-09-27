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
});
