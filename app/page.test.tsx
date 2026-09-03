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
    expect(signIn.className.split(" ")).toContain("bg-primary");
    expect(signIn.className).toContain("text-primary-foreground");

    const hero = screen.getByRole("heading", { level: 1 }).closest("section");
    expect(hero).not.toBeNull();
    const heroPrimary = within(hero!).getByRole("link", { name: /Start planning/ });
    expect(heroPrimary.getAttribute("href")).toBe("/register");
    expect(heroPrimary.className.split(" ")).toContain("bg-primary");
    expect(heroPrimary.className).toContain("border-primary");
    expect(heroPrimary.className).toContain("shadow-primary/25");

    const heroSecondary = within(hero!).getByRole("link", { name: "See how it works" });
    expect(heroSecondary.getAttribute("href")).toBe("#how-it-works");
    expect(heroSecondary.className).toContain("border-primary/40");
    expect(heroSecondary.className).toContain("bg-transparent");
    expect(heroSecondary.className).toContain("hover:bg-primary/10");
    expect(within(hero!).queryByText("Free to start. No password required.")).toBeNull();
  });

  it("shows the offline-ready synchronized product state", () => {
    render(<Home />);

    expect(screen.getByText("Offline Ready")).toBeTruthy();
    expect(screen.getByText("Synced")).toBeTruthy();
    expect(screen.getByText("Today in Lisbon")).toBeTruthy();
  });
});
