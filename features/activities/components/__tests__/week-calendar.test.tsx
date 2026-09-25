import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WeekCalendar } from "@/features/activities/components/week-calendar";

vi.mock("@/lib/i18n/i18n-provider", () => ({
  useI18n: () => ({
    t: (key: string) =>
      ({
        "common.tripCalendar": "Trip calendar",
        "common.clickOpenTime": "Click to open a time",
        "common.localTime": "Local time",
        "common.today": "Today",
        "common.range": "Range",
        "common.all": "All",
        "common.rangeStart": "Range start date",
        "common.rangeEnd": "Range end date",
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

    const toolbar = screen.getByRole("banner");
    expect(toolbar.className).toContain("from-sky-200");
    expect(toolbar.className).toContain("to-teal-300");
    expect(screen.getByRole("button", { name: "Today" }).className).toContain("bg-sky-100");
    expect(screen.getByRole("button", { name: "Range" }).className).toContain("bg-teal-100");
    expect(screen.getByRole("button", { name: "All" }).className).toContain("bg-cyan-100");

    fireEvent.click(screen.getByRole("button", { name: "Range" }));
    expect(screen.getByLabelText("Range start date").className).toContain("bg-sky-100");
    expect(screen.getByLabelText("Range end date").className).toContain("bg-teal-100");

    const localTime = screen.getByText("Local time");
    expect(localTime.className).toContain("sticky");
    expect(localTime.className).toContain("left-0");
    expect(localTime.className).toContain("bg-teal-300");
    expect(screen.getByLabelText(/Day 1/).className).toContain("bg-sky-300");
    expect(screen.getByLabelText(/Day 1/).textContent).toContain("Day 1");
    expect(screen.getByLabelText(/Day 2/).textContent).toContain("Day 2");
  });
});
