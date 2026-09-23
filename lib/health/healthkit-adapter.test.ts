import { beforeEach, describe, expect, it, vi } from "vitest";

const healthFitness = vi.hoisted(() => ({
  requestHealthPermissions: vi.fn(),
  getData: vi.fn(),
}));

vi.mock("@capacitor/health-fitness", () => ({
  HealthFitness: healthFitness,
}));

import { HealthKitAdapter } from "@/lib/health/healthkit-adapter";

describe("HealthKitAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    healthFitness.requestHealthPermissions.mockResolvedValue(undefined);
  });

  it("requests read access for steps only", async () => {
    const adapter = new HealthKitAdapter();

    await expect(adapter.requestPermissions()).resolves.toEqual({
      platform: "ios",
      state: "authorized",
      readSteps: true,
    });

    expect(healthFitness.requestHealthPermissions).toHaveBeenCalledWith(
      expect.objectContaining({
        customPermissions: JSON.stringify([{ Variable: "STEPS", AccessType: "READ" }]),
        allVariables: JSON.stringify({ IsActive: false, AccessType: "READ" }),
      })
    );
  });

  it("normalizes the native daily result into a local day aggregate", async () => {
    healthFitness.getData.mockResolvedValue({
      results: JSON.stringify([{ Value: 1200 }, { Value: 3420 }]),
    });
    const adapter = new HealthKitAdapter();

    await expect(adapter.queryDailySteps("2026-09-22")).resolves.toEqual({
      dayDate: "2026-09-22",
      steps: 4620,
    });

    expect(healthFitness.getData).toHaveBeenCalledWith({
      parameters: expect.stringContaining('"Variable":"STEPS"'),
    });
  });

  it("maps permission failures to a denied result", async () => {
    healthFitness.requestHealthPermissions.mockRejectedValue(new Error("permission denied"));
    const adapter = new HealthKitAdapter();

    await expect(adapter.requestPermissions()).resolves.toMatchObject({
      state: "denied",
      readSteps: false,
    });
  });
});
