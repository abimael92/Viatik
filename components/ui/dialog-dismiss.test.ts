import { describe, expect, it } from "vitest";

import { isDialogDismissExempt } from "@/components/ui/dialog-dismiss";

describe("isDialogDismissExempt", () => {
  it("keeps place suggestion and menu targets from dismissing a dialog", () => {
    const places = document.createElement("div");
    places.setAttribute("data-places-suggestions", "");
    const option = document.createElement("button");
    places.append(option);
    document.body.append(places);

    const menu = document.createElement("div");
    menu.setAttribute("role", "menu");
    const item = document.createElement("div");
    menu.append(item);
    document.body.append(menu);

    const pac = document.createElement("div");
    pac.className = "pac-container";
    const pacItem = document.createElement("div");
    pac.append(pacItem);
    document.body.append(pac);

    expect(isDialogDismissExempt(option)).toBe(true);
    expect(isDialogDismissExempt(item)).toBe(true);
    expect(isDialogDismissExempt(pacItem)).toBe(true);
    expect(isDialogDismissExempt(document.body)).toBe(false);
    expect(isDialogDismissExempt(null)).toBe(false);
  });
});
