import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Collapsible } from "@/components/ui/collapsible";

describe("Collapsible", () => {
  it("opens and closes on its own when uncontrolled", () => {
    render(
      <Collapsible id="details" title="Details">
        Panel body
      </Collapsible>
    );

    const trigger = screen.getByRole("button", { name: "Details" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Panel body")).toBeNull();

    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("region", { name: "Details" })).toBeTruthy();

    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("lets the caller own the open state", () => {
    const onOpenChange = vi.fn();
    render(
      <Collapsible id="details" title="Details" open={false} onOpenChange={onOpenChange}>
        Panel body
      </Collapsible>
    );

    fireEvent.click(screen.getByRole("button", { name: "Details" }));

    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(screen.queryByText("Panel body")).toBeNull();
  });

  it("renders the panel when the caller opens it", () => {
    render(
      <Collapsible id="details" title="Details" open>
        Panel body
      </Collapsible>
    );

    expect(screen.getByRole("button", { name: "Details" }).getAttribute("aria-expanded")).toBe(
      "true"
    );
    expect(screen.getByText("Panel body")).toBeTruthy();
  });
});
