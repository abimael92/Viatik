import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("dexie", async (importOriginal) => {
  const actual = await importOriginal<typeof import("dexie")>();
  return {
    ...actual,
    liveQuery: (querier: () => Promise<unknown>) => ({
      subscribe(observer: { next: (value: unknown) => void }) {
        void Promise.resolve(querier()).then((value) => observer.next(value));
        return { unsubscribe() {} };
      },
    }),
  };
});

vi.mock("@/lib/sync/sync-engine", () => ({
  syncNow: vi.fn(),
}));

vi.mock("@/lib/db/database-provider", () => ({
  useDatabase: () => ({ outboxMutations: { toArray: () => Promise.resolve([]) } }),
}));

vi.mock("@/lib/sync/use-sync-status", () => ({
  useSyncStatus: () => ({
    status: "idle",
    pending: 0,
    retryablePending: 0,
    lastSyncAt: null,
    lastError: null,
    isOnline: true,
    conflicts: 0,
  }),
}));

import { SyncStatusPill } from "@/components/app-shell/sync-status-pill";

describe("SyncStatusPill", () => {
  it("renders the up-to-date state at a screen-scaled size", () => {
    render(<SyncStatusPill />);

    const label = screen.getByText("Up to date");
    expect(label.className).toContain("truncate");
    const status = label.parentElement!;
    expect(status.className).toContain("min-w-0");
    expect(status.className).toContain("text-base");
    expect(status.className).toContain("lg:text-sm");
    expect(status.className).toContain("xl:text-base");
    expect(status.className).not.toContain("text-[8px]");
  });
});
