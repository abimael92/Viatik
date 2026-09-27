import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import Home from "@/app/page";

vi.mock("next/image", () => ({ default: () => null }));

describe("landing page visual hierarchy", () => {
  afterEach(cleanup);

  it("keeps navigation lightweight and makes the hero CTA primary", () => {
    render(<Home />);

    const navigation = screen.getByRole("navigation", { name: "Primary navigation" });
    const header = navigation.closest("header");
    expect(header?.className).toContain("sticky");
    expect(header?.className).toContain("backdrop-blur-md");
    expect(header?.className).toContain("bg-background/60");
    expect(header?.className).toContain("border-border/40");

    const links = within(navigation).getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(within(navigation).queryByRole("link", { name: "Get Started" })).toBeNull();
    expect(links.some((link) => link.getAttribute("href") === "/register")).toBe(false);

    const features = within(navigation).getByRole("link", { name: "Features" });
    const signIn = within(navigation).getByRole("link", { name: "Sign in" });
    expect(features.className).toContain("border-primary/40");
    expect(features.className).toContain("bg-transparent");
    // Primary CTA uses the Viatik brand gradient, not the flat primary fill.
    expect(signIn.className.split(" ")).toContain("bg-linear-to-r");
    expect(signIn.className).toContain("from-viatik-magenta");
    expect(signIn.className).toContain("text-white");

    const hero = screen.getByRole("heading", { level: 1 }).closest("section");
    expect(hero).not.toBeNull();
    const heroPrimary = within(hero!).getByRole("link", { name: /Start planning/ });
    expect(heroPrimary.getAttribute("href")).toBe("/register");
    expect(heroPrimary.className.split(" ")).toContain("bg-linear-to-r");
    expect(heroPrimary.className).toContain("to-viatik-red");
    expect(heroPrimary.className).toContain("shadow-viatik-red/25");

    const heroSecondary = within(hero!).getByRole("link", { name: "See how it works" });
    expect(heroSecondary.getAttribute("href")).toBe("#how-it-works");
    expect(heroSecondary.className).toContain("border-viatik-magenta/40");
    expect(heroSecondary.className).toContain("bg-transparent");
    expect(heroSecondary.className).toContain("hover:bg-viatik-magenta/10");
    expect(within(hero!).queryByText("Free to start. No password required.")).toBeNull();

    const themeToggle = within(navigation).getByRole("button", { name: "Toggle theme" });
    expect(themeToggle.className).toContain("text-muted-foreground");
    expect(themeToggle.className).toContain("hover:bg-muted");
  });

  it("places each feature title beside its icon", () => {
    render(<Home />);

    const title = screen.getByRole("heading", { name: "Plan together" });
    const row = title.parentElement;
    expect(row?.className).toContain("flex");
    expect(row?.className).toContain("items-center");
    expect(row?.className).not.toContain("flex-col");
    expect(title.className).not.toContain("mt-");
    expect(row?.firstElementChild).not.toBe(title);
    expect(row?.firstElementChild?.className).toContain("bg-viatik-magenta/10");
    expect(row?.firstElementChild?.className).toContain("text-viatik-magenta");

    const offline = screen.getByRole("heading", { name: "Ready offline" });
    expect(offline.parentElement?.firstElementChild?.className).toContain("bg-viatik-blue/10");
    expect(offline.parentElement?.firstElementChild?.className).toContain("text-viatik-blue");
  });

  it("shows the offline-ready synchronized product state", () => {
    render(<Home />);

    expect(screen.getByText("Offline Ready")).toBeTruthy();
    expect(screen.getByText("Synced")).toBeTruthy();
    expect(screen.getByText("Today in Lisbon")).toBeTruthy();

    const cta = screen.getByRole("heading", { name: "Your next trip deserves one shared plan." }).closest("section");
    expect(cta?.className).toContain("glow-viatik");
    expect(cta?.className).toContain("border-viatik-magenta/35");
    expect(cta?.className).toContain("bg-surface-dark");

    const features = screen.getByRole("heading", { name: "Less coordination. More adventure." }).closest("section");
    expect(features?.querySelector(".glow-viatik")).not.toBeNull();
  });
});
