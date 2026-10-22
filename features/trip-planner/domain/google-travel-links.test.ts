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
      "Flights from Montréal, QC to Tokyo & Kyoto on 2027-04-05"
    );
  });

  it("omits missing optional flight search details", () => {
    const url = new URL(
      buildGoogleFlightsUrl({ origin: "", destination: "Lisbon", startDate: null })
    );
    expect(url.searchParams.get("q")).toBe("Flights to Lisbon");
  });

  it("carries the full search criteria so the provider opens pre-filtered", () => {
    const url = new URL(
      buildGoogleFlightsUrl({
        origin: "Guadalajara, Mexico",
        destination: "Kyoto, Japan",
        startDate: "2027-08-21",
        returnDate: "2027-08-27",
        passengers: 2,
        nonstopOnly: true,
        currency: "usd",
        locale: "es",
      })
    );

    expect(url.pathname).toBe("/travel/flights");
    expect(url.searchParams.get("q")).toBe(
      "Flights from Guadalajara, Mexico to Kyoto, Japan on 2027-08-21 through 2027-08-27 nonstop 2 passengers"
    );
    expect(url.searchParams.get("curr")).toBe("USD");
    expect(url.searchParams.get("hl")).toBe("es");
  });

  it("never appends an English cabin phrase, which breaks non-English parses", () => {
    const url = new URL(
      buildGoogleFlightsUrl({
        origin: "Chihuahua City, Chihuahua, Mexico",
        destination: "Cancun, Mexico",
        startDate: "2027-06-21",
        returnDate: "2027-06-24",
        passengers: 2,
        nonstopOnly: true,
        currency: "MXN",
        locale: "es",
      })
    );

    const query = url.searchParams.get("q") ?? "";
    expect(query).toBe(
      "Flights from Chihuahua City, Chihuahua, Mexico to Cancun, Mexico on 2027-06-21 through 2027-06-24 nonstop 2 passengers"
    );
    expect(query).not.toContain("economy");
    expect(query).not.toContain("class");
  });

  it("rejects invalid passenger counts and dates", () => {
    expect(() =>
      buildGoogleFlightsUrl({
        origin: "",
        destination: "Lisbon",
        startDate: null,
        passengers: 0,
      })
    ).toThrow(/travelers/);
    expect(() =>
      buildGoogleFlightsUrl({
        origin: "",
        destination: "Lisbon",
        startDate: null,
        returnDate: "2027-02-30",
      })
    ).toThrow(/return date/);
  });

  it("creates hotel searches from destination text only", () => {
    const url = new URL(buildGoogleHotelsUrl("Kyoto, Japan"));
    expect(url.origin).toBe("https://www.google.com");
    expect(url.pathname).toBe("/travel/hotels");
    expect(url.searchParams.get("q")).toBe("Hotels in Kyoto, Japan");
  });
});
