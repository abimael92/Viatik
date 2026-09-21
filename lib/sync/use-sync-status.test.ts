import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const syncNow = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const retryFailedMutations = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock("@/lib/sync/sync-engine", () => ({
  getSyncState: vi.fn(() => ({ status: "idle", pending: 0, retryablePending: 0, lastSyncAt: null, lastError: null })),
  subscribeToSync: vi.fn(() => vi.fn()),
  syncNow,
  retryFailedMutations,
}));

vi.mock("@/lib/db/database-provider", () => ({
  useDatabase: vi.fn(),
}));

import { useSyncRetryCountdown, type SyncStatusState } from "@/lib/sync/use-sync-status";

const baseState: SyncStatusState = {
  status: "error",
  pending: 1,
  retryablePending: 1,
  lastSyncAt: null,
  lastError: null,
  isOnline: true,
  conflicts: 0,
};

describe("useSyncRetryCountdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    syncNow.mockClear();
    retryFailedMutations.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries automatically after a five-second countdown", () => {
    const { result } = renderHook(() => useSyncRetryCountdown(baseState));

    expect(result.current.countdown).toBe(5);
    act(() => vi.advanceTimersByTime(4000));
    expect(result.current.countdown).toBe(1);
    expect(syncNow).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.countdown).toBeNull();
    expect(syncNow).toHaveBeenCalledTimes(1);
  });

  it("allows the user to retry immediately and cancels the countdown", () => {
    const { result } = renderHook(() => useSyncRetryCountdown(baseState));

    act(() => result.current.retryNow());
    act(() => vi.advanceTimersByTime(5000));

    expect(retryFailedMutations).toHaveBeenCalledTimes(1);
    expect(result.current.countdown).toBeNull();
  });
});
