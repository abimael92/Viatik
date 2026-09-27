import { describe, expect, it } from "vitest";

import { departureStops } from "@/features/trips/lib/departure-stops";

describe("departureStops", () => {
  it("keeps transit and lodging from today onward, earliest first", () => {
    const stops = departureStops(
      [
        { id: "past-flight", title: "Arrival", dayDate: "2026-09-26", startTime: "2026-09-26T08:00:00", category: "transit" },
        { id: "lunch", title: "Lunch", dayDate: "2026-09-27", startTime: "2026-09-27T13:00:00", category: "food-and-drink" },
        { id: "checkout", title: "Hotel", dayDate: "2026-09-27", startTime: "2026-09-27T11:00:00", category: "lodging" },
        { id: "taxi", title: "Airport taxi", dayDate: "2026-09-27", startTime: "2026-09-27T14:00:00", category: "transport" },
        { id: "deleted", title: "Old bus", dayDate: "2026-09-28", startTime: null, category: "transit", deletedAt: "2026-09-27T00:00:00.000Z" },
      ],
      "2026-09-27",
    );

    expect(stops.map((stop) => stop.id)).toEqual(["checkout", "taxi"]);
  });
});
