import { describe, expect, it } from "vitest";

import {
  buildGoogleFlightsUrl,
  buildGoogleHotelsUrl,
} from "@/features/trip-planner/domain/google-travel-links";

describe("Google Travel links", () => {
  it("encodes natural-language flight details into the fixed Google Travel host", () => {
    const url = new URL(
      buildGoogleFlightsUrl({
        origin: "Montréal, QC",
        destination: "Tokyo & Kyoto",
        startDate: "2027-04-05",
      })
    );

    expect(url.origin).toBe("https://www.google.com");
    expect(url.pathname).toBe("/travel/flights");
    expect(url.searchParams.get("q")).toBe(
      "Flights to Tokyo & Kyoto from Montréal, QC on 2027-04-05"
    );
  });

  it("omits missing optional flight search details", () => {
    const url = new URL(
      buildGoogleFlightsUrl({ origin: "", destination: "Lisbon", startDate: null })
    );
    expect(url.searchParams.get("q")).toBe("Flights to Lisbon");
  });

  it("creates hotel searches from destination text only", () => {
    const url = new URL(buildGoogleHotelsUrl("Kyoto, Japan"));
    expect(url.origin).toBe("https://www.google.com");
    expect(url.pathname).toBe("/travel/hotels");
    expect(url.searchParams.get("q")).toBe("Hotels in Kyoto, Japan");
  });
});
