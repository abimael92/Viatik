import { describe, expect, it } from "vitest";

import { getScoutWizardSteps } from "@/features/trip-planner/domain/scout-wizard-steps";

describe("getScoutWizardSteps", () => {
  it("asks all six questions in idea mode", () => {
    expect(getScoutWizardSteps(false)).toEqual([
      "where",
      "vibe",
      "crew",
      "budget",
      "takeoff",
      "timing",
    ]);
  });

  it("skips the vibe question in route mode and keeps where first", () => {
    const steps = getScoutWizardSteps(true);
    expect(steps).toEqual(["where", "crew", "budget", "takeoff", "timing"]);
    expect(steps[0]).toBe("where");
    expect(steps).not.toContain("vibe");
  });
});
