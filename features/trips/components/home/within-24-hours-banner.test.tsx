import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  isWithinNext24Hours,
  WithinNext24HoursBanner,
} from "@/features/trips/components/home/within-24-hours-banner";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-30T12:00:00"));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("isWithinNext24Hours", () => {
  it("is true when the trip starts within the next 24 hours", () => {
    expect(isWithinNext24Hours("2026-10-31")).toBe(true);
  });

  it("is false for a trip starting today (already past midnight), further out, or unset", () => {
    expect(isWithinNext24Hours("2026-10-30")).toBe(false);
    expect(isWithinNext24Hours("2026-11-01")).toBe(false);
    expect(isWithinNext24Hours(null)).toBe(false);
  });
});

describe("WithinNext24HoursBanner", () => {
  it("renders the check-in & pack banner inside the 24-hour window", () => {
    render(<WithinNext24HoursBanner startDate="2026-10-31" />);
    expect(screen.getByRole("heading", { name: "Check in & pack" })).toBeTruthy();
  });

  it("renders nothing outside the window", () => {
    const { container } = render(<WithinNext24HoursBanner startDate="2026-11-05" />);
    expect(container.firstChild).toBeNull();
  });
});
