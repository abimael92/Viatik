import { describe, expect, it } from "vitest";

import {
  deriveRouteFacts,
  repairRouteContiguity,
  routeSignature,
  toTripIdeaFlightRoute,
} from "@/features/trip-planner/domain/scout-flight-route";
import type { ScoutFlightRoute } from "@/features/trip-planner/domain/scout-trip-ideas-schema";

const nonstop: ScoutFlightRoute = {
  legs: [
    {
      from: "Guadalajara",
      to: "Kyoto",
      approx_duration_minutes: 780,
      layover_after_minutes: 0,
    },
  ],
  arrives_same_date: true,
};

const oneStop: ScoutFlightRoute = {
  legs: [
    {
      from: "Guadalajara",
      to: "Los Angeles",
      approx_duration_minutes: 210,
      layover_after_minutes: 150,
    },
    {
      from: "Los Angeles",
      to: "Kyoto",
      approx_duration_minutes: 720,
      layover_after_minutes: 0,
    },
  ],
  arrives_same_date: true,
};

describe("deriveRouteFacts", () => {
  it("counts stops and sums flight plus layover minutes", () => {
    expect(deriveRouteFacts(nonstop)).toEqual({
      stops: 0,
      elapsedMinutes: 780,
      arrivesSameDate: true,
    });
    expect(deriveRouteFacts(oneStop)).toEqual({
      stops: 1,
      elapsedMinutes: 1080,
      arrivesSameDate: true,
    });
  });

  it("never reports a same-date arrival for a journey of 24 hours or more", () => {
    const marathon: ScoutFlightRoute = {
      legs: [
        { from: "A", to: "B", approx_duration_minutes: 800, layover_after_minutes: 300 },
        { from: "B", to: "C", approx_duration_minutes: 800, layover_after_minutes: 0 },
      ],
      arrives_same_date: true,
    };
    expect(deriveRouteFacts(marathon).elapsedMinutes).toBe(1900);
    expect(deriveRouteFacts(marathon).arrivesSameDate).toBe(false);
  });
});

describe("repairRouteContiguity", () => {
  it("copies each previous leg's `to` into the next `from`", () => {
    const legs = [
      { from: "Guadalajara", to: "Los Angeles" },
      { from: "Tokyo", to: "Kyoto" },
    ];
    expect(repairRouteContiguity(legs)).toEqual([
      { from: "Guadalajara", to: "Los Angeles" },
      { from: "Los Angeles", to: "Kyoto" },
    ]);
  });

  it("leaves contiguous and single-leg chains untouched", () => {
    expect(repairRouteContiguity(oneStop.legs)).toEqual(oneStop.legs);
    expect(repairRouteContiguity(nonstop.legs)).toEqual(nonstop.legs);
  });
});

describe("routeSignature", () => {
  it("joins the city chain lower-cased so routings dedupe case-insensitively", () => {
    expect(routeSignature(oneStop)).toBe("guadalajara > los angeles > kyoto");
    expect(routeSignature(nonstop)).toBe("guadalajara > kyoto");
    expect(routeSignature(oneStop)).not.toBe(routeSignature(nonstop));
  });
});

describe("toTripIdeaFlightRoute", () => {
  it("maps to the persisted camelCase estimate shape", () => {
    expect(toTripIdeaFlightRoute(oneStop)).toEqual({
      legs: [
        {
          from: "Guadalajara",
          to: "Los Angeles",
          approxDurationMinutes: 210,
          layoverAfterMinutes: 150,
        },
        {
          from: "Los Angeles",
          to: "Kyoto",
          approxDurationMinutes: 720,
          layoverAfterMinutes: 0,
        },
      ],
      arrivesSameDate: true,
      isEstimate: true,
    });
  });

  it("carries the gated same-date flag, not the model's raw boolean", () => {
    const marathon: ScoutFlightRoute = {
      legs: [
        { from: "A", to: "B", approx_duration_minutes: 900, layover_after_minutes: 0 },
        { from: "B", to: "C", approx_duration_minutes: 900, layover_after_minutes: 0 },
      ],
      arrives_same_date: true,
    };
    expect(toTripIdeaFlightRoute(marathon).arrivesSameDate).toBe(false);
  });
});
