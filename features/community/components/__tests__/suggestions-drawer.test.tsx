import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/community/components/add-suggestion-dialog", () => ({
  AddSuggestionDialog: () => null,
}));
vi.mock("@/app/actions/profile", () => ({
  getMyProfile: vi.fn(async () => null),
}));
vi.mock("@/features/profile/data/dexie-profile-repository", () => ({
  profileRepository: {
    watch: vi.fn(() => () => undefined),
    upsert: vi.fn(async () => undefined),
  },
}));

import { SuggestionsDrawer } from "@/features/community/components/suggestions-drawer";

function renderDrawer() {
  return render(
    <SuggestionsDrawer userId="user-1" open onOpenChange={() => undefined} inline />
  );
}

describe("SuggestionsDrawer", () => {
  afterEach(cleanup);

  it("offers five community ideas with their details and a 3/5-month saving plan", () => {
    renderDrawer();

    const cards = screen.getAllByRole("button", {
      name: /Kyoto in Spring|Lisbon City Break|Patagonia Trek|Tokyo Food Trip|Marrakech & the Atlas/,
    });
    expect(cards).toHaveLength(5);

    // Kyoto: 5 days for 2 travelers, priced from its own baselines.
    const kyoto = screen.getByRole("button", { name: /Kyoto in Spring/ });
    expect(kyoto.textContent).toContain("5 days");
    expect(kyoto.textContent).toContain("2 travelers");
    expect(kyoto.textContent).toContain("9 Activities");
    expect(kyoto.textContent).toContain("Trip cost");
    expect(kyoto.textContent).toContain("$3,850.00");
    expect(kyoto.textContent).toContain("3 mo ≈ $1,283.34/mo · 5 mo ≈ $770.00/mo");
  });

  it("keeps each idea on its own duration and cost band", () => {
    renderDrawer();

    const lisbon = screen.getByRole("button", { name: /Lisbon City Break/ });
    expect(lisbon.textContent).toContain("3 days");
    expect(lisbon.textContent).toContain("€2,390.00");

    const patagonia = screen.getByRole("button", { name: /Patagonia Trek/ });
    expect(patagonia.textContent).toContain("6 days");
    expect(patagonia.textContent).toContain("$4,620.00");
  });

  it("labels the figures as estimates for the whole party", () => {
    renderDrawer();
    expect(
      screen.getByText("Costs are estimates for the whole party, in your currency.")
    ).toBeTruthy();
  });
});
