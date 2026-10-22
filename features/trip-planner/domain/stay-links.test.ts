import { describe, expect, it } from "vitest";

import { buildAirbnbSearchUrl } from "@/features/trip-planner/domain/stay-links";

describe("buildAirbnbSearchUrl", () => {
  it("builds a destination search without dates", () => {
    const url = buildAirbnbSearchUrl({ destination: "Kyoto, Japan" });
    expect(url).toBe("https://www.airbnb.com/s/Kyoto--Japan/homes");
  });

  it("slugifies punctuation so the provider header stays readable", () => {
    expect(new URL(buildAirbnbSearchUrl({ destination: "Ho Chi Minh City, Vietnam" })).pathname).toBe(
      "/s/Ho--Chi--Minh--City--Vietnam/homes"
    );
  });

  it("adds valid check-in, check-out, and guest counts", () => {
    const url = new URL(
      buildAirbnbSearchUrl({
        destination: "Porto, Portugal",
        checkIn: "2027-08-21",
        checkOut: "2027-08-27",
        adults: 2,
      })
    );
    expect(url.pathname).toBe("/s/Porto--Portugal/homes");
    expect(url.searchParams.get("checkin")).toBe("2027-08-21");
    expect(url.searchParams.get("checkout")).toBe("2027-08-27");
    expect(url.searchParams.get("adults")).toBe("2");
  });

  it("rejects invalid guest counts", () => {
    expect(() =>
      buildAirbnbSearchUrl({ destination: "Kyoto, Japan", adults: 21 })
    ).toThrow(/guests/);
  });

  it("rejects empty destinations, oversized text, and malformed dates", () => {
    expect(() => buildAirbnbSearchUrl({ destination: "  " })).toThrow(/Destination is required/);
    expect(() => buildAirbnbSearchUrl({ destination: "x".repeat(121) })).toThrow(
      /Destination is too long/
    );
    expect(() =>
      buildAirbnbSearchUrl({ destination: "Kyoto, Japan", checkIn: "2027-02-30" })
    ).toThrow(/check-in/);
  });
});
