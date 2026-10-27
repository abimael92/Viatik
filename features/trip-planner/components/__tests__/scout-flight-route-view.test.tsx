import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  FlightRouteLegs,
  FlightRouteSummary,
} from "@/features/trip-planner/components/scout-flight-route-view";
import type { ScoutFlightRoute } from "@/features/trip-planner/domain/scout-trip-ideas-schema";

const nonstop: ScoutFlightRoute = {
  legs: [
    { from: "Guadalajara", to: "Kyoto", approx_duration_minutes: 780, layover_after_minutes: 0 },
  ],
  arrives_same_date: true,
};

const oneStop: ScoutFlightRoute = {
  legs: [
    {
      from: "Guadalajara",
      to: "Mexico City",
      approx_duration_minutes: 90,
      layover_after_minutes: 95,
    },
    { from: "Mexico City", to: "Kyoto", approx_duration_minutes: 720, layover_after_minutes: 0 },
  ],
  arrives_same_date: false,
};

const marathon: ScoutFlightRoute = {
  legs: [
    { from: "A", to: "B", approx_duration_minutes: 800, layover_after_minutes: 300 },
    { from: "B", to: "C", approx_duration_minutes: 800, layover_after_minutes: 0 },
  ],
  arrives_same_date: true,
};

describe("FlightRouteSummary", () => {
  it("shows the chain, nonstop label, elapsed time, and same-day badge", () => {
    render(<FlightRouteSummary route={nonstop} />);
    expect(screen.getByText("Guadalajara → Kyoto")).toBeTruthy();
    expect(screen.getByText("Nonstop")).toBeTruthy();
    expect(screen.getByText("13h 0m")).toBeTruthy();
    expect(screen.getByText("Lands same day")).toBeTruthy();
  });

  it("counts stops and flags next-day arrivals", () => {
    render(<FlightRouteSummary route={oneStop} />);
    expect(screen.getByText("Guadalajara → Mexico City → Kyoto")).toBeTruthy();
    expect(screen.getByText("1 stop")).toBeTruthy();
    expect(screen.getByText("Arrives next day or later")).toBeTruthy();
  });

  it("never badges a 24h+ journey as same-day even when the model claims it", () => {
    render(<FlightRouteSummary route={marathon} />);
    expect(screen.getByText("Arrives next day or later")).toBeTruthy();
    expect(screen.getByText("31h 40m")).toBeTruthy();
  });
});

describe("FlightRouteLegs", () => {
  it("lists every leg with its duration and layover, plus the estimate note", () => {
    render(<FlightRouteLegs route={oneStop} />);
    expect(screen.getByText("Guadalajara → Mexico City")).toBeTruthy();
    expect(screen.getByText("Mexico City → Kyoto")).toBeTruthy();
    expect(screen.getByText("Layover in Mexico City · 1h 35m")).toBeTruthy();
    expect(screen.getByText(/airlines and schedules aren't known/)).toBeTruthy();
  });
});
