import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DestinationField } from "@/features/trips/components/destination-field";

const mocks = vi.hoisted(() => ({ searchDestinations: vi.fn(), getPlaceDetails: vi.fn() }));

vi.mock("@/app/actions/places", () => mocks);
vi.mock("@/lib/i18n/i18n-provider", () => ({
  useI18n: () => ({
    t: (key: string) =>
      key === "copy.destinationSearchUnavailable"
        ? "Location search is temporarily unavailable."
        : key,
  }),
}));

describe("DestinationField", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it("keeps typed destinations usable when autocomplete is offline", async () => {
    mocks.searchDestinations.mockRejectedValue(new Error("Network unavailable"));
    render(<DestinationField defaultValue="" />);
    const input = screen.getByLabelText("copy.destination") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "Kyoto, Japan" } });

    expect(await screen.findByText("Location search is temporarily unavailable.")).toBeTruthy();
    expect(input.value).toBe("Kyoto, Japan");
  });

  it("does not open the suggestion list for a programmatically filled value", async () => {
    mocks.searchDestinations.mockResolvedValue({
      configured: true,
      suggestions: [{ placeId: "p1", label: "Chihuahua, Mexico" }],
    });
    render(
      <DestinationField value="Chihuahua, Mexico" onChange={() => undefined} autoSearch={false} />
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    expect(mocks.searchDestinations).not.toHaveBeenCalled();
    expect(screen.queryByText("Chihuahua, Mexico", { selector: "button" })).toBeNull();
  });
});
