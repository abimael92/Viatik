import { describe, expect, it } from "vitest";

import {
  extractBestSeason,
  monthName,
  parseSeasonMonths,
  splitSeason,
} from "@/features/trip-planner/domain/season-window";

describe("season window parsing", () => {
  it("reads the season line out of Scout's notes", () => {
    expect(
      extractBestSeason("Turquoise water. Two hours from home.\n\nBest season: dic – abr · días cálidos")
    ).toBe("dic – abr · días cálidos");
    expect(extractBestSeason("Book the corner suite.")).toBeNull();
  });

  it("splits the month range from its descriptor", () => {
    expect(splitSeason("dic – abr · días cálidos")).toEqual({
      range: "dic – abr",
      note: "días cálidos",
    });
    expect(splitSeason("Fall (Oct-Nov) for foliage")).toEqual({
      range: "Fall (Oct-Nov) for foliage",
      note: null,
    });
  });

  it("resolves abbreviated Spanish months to indices", () => {
    expect(parseSeasonMonths("dic – abr", "es")).toEqual({ startMonth: 11, endMonth: 3 });
    expect(parseSeasonMonths("dic – abr", "en")).toEqual({ startMonth: 11, endMonth: 3 });
  });

  it("resolves English months and full names", () => {
    expect(parseSeasonMonths("Dec – Apr", "en")).toEqual({ startMonth: 11, endMonth: 3 });
    expect(parseSeasonMonths("diciembre – abril", "es")).toEqual({ startMonth: 11, endMonth: 3 });
  });

  it("returns null when the text is not a month range", () => {
    expect(parseSeasonMonths("Fall (Oct-Nov) for foliage", "en")).toBeNull();
    expect(parseSeasonMonths("todo el año", "es")).toBeNull();
  });

  it("spells month names in the UI locale", () => {
    expect(monthName(11, "es")).toBe("diciembre");
    expect(monthName(11, "en")).toBe("December");
  });
});
