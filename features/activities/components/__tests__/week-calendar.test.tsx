import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WeekCalendar } from "@/features/activities/components/week-calendar";

vi.mock("@/lib/i18n/i18n-provider", () => ({
  useI18n: () => ({
    t: (key: string) =>
      ({
        "common.tripCalendar": "Trip calendar",
        "common.clickOpenTime": "Click to open a time",
        "common.localTime": "Local time",
      })[key] ?? key,
  }),
}));

vi.mock("@/features/transit/components/use-transit", () => ({
  useTransitSegments: () => ({ segments: [] }),
}));

afterEach(() => cleanup());

describe("WeekCalendar mobile day context", () => {
  it("keeps the local-time rail anchored and labels each day header", () => {
    render(<WeekCalendar tripId="trip-1" days={["2026-09-21", "2026-09-22"]} activities={[]} />);

    const localTime = screen.getByText("Local time");
    expect(localTime.className).toContain("sticky");
    expect(localTime.className).toContain("left-0");
    expect(screen.getByLabelText(/Day 1/).textContent).toContain("Day 1");
    expect(screen.getByLabelText(/Day 2/).textContent).toContain("Day 2");
  });
});
