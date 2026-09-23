import { describe, expect, it, vi } from "vitest";

import type { DailyStepCountRepository } from "@/features/steps/domain/step-types";
import {
  HealthService,
  type HealthProvider,
} from "@/lib/health/health-service";

function makeProvider(overrides: Partial<HealthProvider> = {}): HealthProvider {
  return {
    platform: "ios",
    requestPermissions: vi.fn().mockResolvedValue({
      platform: "ios",
      state: "authorized",
      readSteps: true,
    }),
    queryDailySteps: vi.fn().mockResolvedValue({ dayDate: "2026-09-22", steps: 6420 }),
    ...overrides,
  };
}

describe("HealthService", () => {
  it("returns an unavailable web result when no native platform is present", async () => {
    const service = new HealthService();

    await expect(service.requestPermissions()).resolves.toEqual({
      platform: "web",
      state: "unavailable",
      readSteps: false,
    });
    await expect(service.queryDailySteps("2026-09-22")).rejects.toThrow("not supported on the web");
  });

  it("delegates permission requests to the configured provider", async () => {
    const provider = makeProvider();
    const service = new HealthService(provider);

    await expect(service.requestPermissions()).resolves.toMatchObject({
      state: "authorized",
      readSteps: true,
    });
    expect(provider.requestPermissions).toHaveBeenCalledOnce();
  });

  it("rejects invalid or mismatched daily provider payloads", async () => {
    const invalidProvider = makeProvider({
      queryDailySteps: vi.fn().mockResolvedValue({ dayDate: "2026-09-23", steps: 6420 }),
    });
    const service = new HealthService(invalidProvider);

    await expect(service.queryDailySteps("2026-09-22")).rejects.toThrow("invalid calendar day");

    await expect(service.queryDailySteps("not-a-day")).rejects.toThrow("valid calendar day");
  });

  it("writes normalized daily totals through the local repository", async () => {
    const provider = makeProvider({
      queryDailySteps: vi.fn()
        .mockResolvedValueOnce({ dayDate: "2026-09-22", steps: 6420 })
        .mockResolvedValueOnce({ dayDate: "2026-09-23", steps: 7000 }),
    });
    const repository = {
      upsert: vi.fn().mockImplementation(async (input) => ({
        id: `${input.tripId}:${input.userId}:${input.dayDate}`,
        ...input,
        source: "manual",
        createdAt: "2026-09-22T00:00:00.000Z",
        updatedAt: "2026-09-22T00:00:00.000Z",
      })),
    } as unknown as DailyStepCountRepository;
    const service = new HealthService(provider, repository);

    await service.syncToDexie({
      userId: "user-1",
      tripId: "trip-1",
      dates: ["2026-09-22", "2026-09-22", "2026-09-23"],
    });

    expect(repository.upsert).toHaveBeenCalledTimes(2);
    expect(repository.upsert).toHaveBeenNthCalledWith(1, {
      userId: "user-1",
      tripId: "trip-1",
      dayDate: "2026-09-22",
      steps: 6420,
    });
  });
});
