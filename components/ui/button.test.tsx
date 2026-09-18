import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("gives secondary buttons a light purple background and dark border", () => {
    render(<Button variant="secondary">Cancel</Button>);

    const button = screen.getByRole("button", { name: "Cancel" });
    expect(button.className).toContain("bg-primary/10");
    expect(button.className).toContain("border-foreground/30");
    expect(button.className).toContain("text-foreground");
  });

  it("gives AI buttons a light Viatik blue background and dark border", () => {
    render(<Button variant="ai">Re-scout</Button>);

    const button = screen.getByRole("button", { name: "Re-scout" });
    expect(button.className).toContain("bg-viatik-blue/10");
    expect(button.className).toContain("border-viatik-blue/40");
    expect(button.className).toContain("text-foreground");
  });
});
