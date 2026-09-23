import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TripStepsWidget } from "@/features/steps/components/trip-steps-widget";
import type { DailyStepCount } from "@/features/steps/domain/step-types";

const mocks = vi.hoisted(() => ({
  watchByTrip: vi.fn(),
  upsert: vi.fn(),
  requestPermissions: vi.fn(),
  queryDailySteps: vi.fn(),
  addListener: vi.fn(),
}));

vi.mock("@capacitor/app", () => ({
  App: { addListener: mocks.addListener },
}));
vi.mock("@/lib/health/health-service", () => ({
  HealthService: class {
    requestPermissions() {
      return mocks.requestPermissions();
    }

    queryDailySteps(date: string) {
      return mocks.queryDailySteps(date);
    }
  },
}));
vi.mock("@/features/steps/data/dexie-step-repository", () => ({
  stepRepository: mocks,
}));

const record: DailyStepCount = {
  id: "trip-1:user-1:2026-09-22",
  tripId: "trip-1",
  userId: "user-1",
  dayDate: "2026-09-22",
  steps: 6420,
  source: "automatic",
  createdAt: "2026-09-22T10:00:00.000Z",
  updatedAt: "2026-09-22T10:00:00.000Z",
};

beforeEach(() => {
  vi.useRealTimers();
  vi.setSystemTime(new Date("2026-09-22T12:00:00.000Z"));
  mocks.watchByTrip.mockImplementation((_userId, _tripId, onChange) => {
    onChange([record]);
    return () => undefined;
  });
  mocks.upsert.mockResolvedValue(record);
  mocks.requestPermissions.mockResolvedValue({ platform: "ios", state: "authorized", readSteps: true });
  mocks.queryDailySteps.mockResolvedValue({ dayDate: "2026-09-22", steps: 7000 });
  mocks.addListener.mockResolvedValue({ remove: vi.fn().mockResolvedValue(undefined) });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("TripStepsWidget", () => {
  it("renders local steps and does not expose browser counting", () => {
    render(
      <TripStepsWidget
        tripId="trip-1"
        userId="user-1"
        startedAt="2026-09-22T10:00:00.000Z"
        endDate="2026-09-24"
        compact
      />
    );

    expect(screen.getByRole("region", { name: "Walking steps" })).toBeTruthy();
    expect(screen.getByText("6,420 steps")).toBeTruthy();
    expect(screen.getByText("Synced from HealthKit or Health Connect")).toBeTruthy();
    expect(screen.queryByText("Automatic counting active")).toBeNull();
    expect(screen.queryByLabelText("Steps for today")).toBeNull();
  });

  it("connects native health data and writes today's result to Dexie", async () => {
    mocks.watchByTrip.mockImplementation((_userId, _tripId, onChange) => {
      onChange([]);
      return () => undefined;
    });

    render(
      <TripStepsWidget
        tripId="trip-1"
        userId="user-1"
        startedAt="2026-09-22T10:00:00.000Z"
        endDate="2026-09-24"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Connect Health Data" }));

    await waitFor(() => {
      expect(mocks.requestPermissions).toHaveBeenCalledOnce();
      expect(mocks.queryDailySteps).toHaveBeenCalledWith("2026-09-22");
      expect(mocks.upsert).toHaveBeenCalledWith({
        userId: "user-1",
        tripId: "trip-1",
        dayDate: "2026-09-22",
        steps: 7000,
      });
    });
  });

  it("shows the native permission placeholder when no daily record exists", () => {
    mocks.watchByTrip.mockImplementation((_userId, _tripId, onChange) => {
      onChange([]);
      return () => undefined;
    });

    render(
      <TripStepsWidget
        tripId="trip-1"
        userId="user-1"
        startedAt="2026-09-22T10:00:00.000Z"
        endDate="2026-09-24"
      />
    );

    expect(screen.getByText("Native Health access required")).toBeTruthy();
    expect(screen.getByText("Enable HealthKit or Health Connect to track steps automatically.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Connect Health Data" })).toBeTruthy();
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("explains that the native app is required on web", async () => {
    mocks.watchByTrip.mockImplementation((_userId, _tripId, onChange) => {
      onChange([]);
      return () => undefined;
    });
    mocks.requestPermissions.mockResolvedValue({ platform: "web", state: "unavailable", readSteps: false });

    render(
      <TripStepsWidget
        tripId="trip-1"
        userId="user-1"
        startedAt="2026-09-22T10:00:00.000Z"
        endDate="2026-09-24"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Connect Health Data" }));

    await waitFor(() => expect(screen.getByText("Automatic tracking requires the Viatik iOS or Android app.")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Connect Health Data" })).toBeNull();
  });

  it("syncs again when the native app returns to the foreground", async () => {
    mocks.watchByTrip.mockImplementation((_userId, _tripId, onChange) => {
      onChange([]);
      return () => undefined;
    });
    let onStateChange: ((state: { isActive: boolean }) => void) | undefined;
    mocks.addListener.mockImplementation((_event, callback) => {
      onStateChange = callback;
      return Promise.resolve({ remove: vi.fn().mockResolvedValue(undefined) });
    });

    render(
      <TripStepsWidget
        tripId="trip-1"
        userId="user-1"
        startedAt="2026-09-22T10:00:00.000Z"
        endDate="2026-09-24"
      />
    );

    await waitFor(() => expect(onStateChange).toBeTypeOf("function"));
    await act(async () => {
      onStateChange?.({ isActive: true });
      await Promise.resolve();
    });

    await waitFor(() => expect(mocks.queryDailySteps).toHaveBeenCalledWith("2026-09-22"));
  });

  it("keeps the history read-only and expandable", () => {
    render(
      <TripStepsWidget
        tripId="trip-1"
        userId="user-1"
        startedAt="2026-09-22T10:00:00.000Z"
        endDate="2026-09-24"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Expand walking steps" }));
    expect(screen.getByLabelText("Trip step history")).toBeTruthy();
    expect(screen.queryByLabelText("Steps for today")).toBeNull();
  });

  it("does not show health tracking before the trip start day", () => {
    render(
      <TripStepsWidget
        tripId="trip-1"
        userId="user-1"
        startedAt="2026-09-23T10:00:00.000Z"
        endDate="2026-09-24"
      />
    );

    expect(screen.getByText("Waiting for trip start")).toBeTruthy();
    expect(screen.queryByText("Native Health access required")).toBeNull();
  });
});
