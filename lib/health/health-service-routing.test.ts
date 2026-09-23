import { beforeEach, describe, expect, it, vi } from "vitest";

const platform = vi.hoisted(() => ({ value: "web" as "web" | "android" }));
const healthConnectAdapter = vi.hoisted(() => ({
  platform: "android",
  requestPermissions: vi.fn(),
  queryDailySteps: vi.fn(),
}));
const healthKitAdapter = vi.hoisted(() => ({
  platform: "ios",
  requestPermissions: vi.fn(),
  queryDailySteps: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: () => platform.value },
}));
vi.mock("@/lib/health/health-connect-adapter", () => ({ healthConnectAdapter }));
vi.mock("@/lib/health/healthkit-adapter", () => ({ healthKitAdapter }));

import { HealthService } from "@/lib/health/health-service";

describe("HealthService platform routing", () => {
  beforeEach(() => {
    platform.value = "android";
    healthConnectAdapter.requestPermissions.mockResolvedValue({
      platform: "android",
      state: "authorized",
      readSteps: true,
    });
    healthConnectAdapter.queryDailySteps.mockResolvedValue({ dayDate: "2026-09-22", steps: 1200 });
  });

  it("routes Android permission and daily queries to Health Connect", async () => {
    const service = new HealthService();

    await expect(service.requestPermissions()).resolves.toMatchObject({
      platform: "android",
      state: "authorized",
    });
    await expect(service.queryDailySteps("2026-09-22")).resolves.toEqual({
      dayDate: "2026-09-22",
      steps: 1200,
    });
    expect(healthConnectAdapter.requestPermissions).toHaveBeenCalledOnce();
    expect(healthConnectAdapter.queryDailySteps).toHaveBeenCalledWith("2026-09-22");
  });
});
