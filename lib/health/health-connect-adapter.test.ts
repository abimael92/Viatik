import { beforeEach, describe, expect, it, vi } from "vitest";

const healthFitness = vi.hoisted(() => ({
  requestHealthPermissions: vi.fn(),
  getData: vi.fn(),
}));

vi.mock("@capacitor/health-fitness", () => ({
  HealthFitness: healthFitness,
}));

import { HealthConnectAdapter } from "@/lib/health/health-connect-adapter";

describe("HealthConnectAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    healthFitness.requestHealthPermissions.mockResolvedValue(undefined);
  });

  it("requests read access for steps only", async () => {
    const adapter = new HealthConnectAdapter();

    await expect(adapter.requestPermissions()).resolves.toEqual({
      platform: "android",
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

  it("normalizes the Health Connect daily result", async () => {
    healthFitness.getData.mockResolvedValue({
      results: JSON.stringify([{ Value: 2300 }, { Value: 1800 }]),
    });
    const adapter = new HealthConnectAdapter();

    await expect(adapter.queryDailySteps(new Date("2026-09-22T12:00:00.000Z"))).resolves.toEqual({
      dayDate: "2026-09-22",
      steps: 4100,
    });
  });

  it("maps permission failures to a denied result", async () => {
    healthFitness.requestHealthPermissions.mockRejectedValue(new Error("permission denied"));
    const adapter = new HealthConnectAdapter();

    await expect(adapter.requestPermissions()).resolves.toMatchObject({
      platform: "android",
      state: "denied",
      readSteps: false,
    });
  });
});
