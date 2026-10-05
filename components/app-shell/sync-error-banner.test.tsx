import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/i18n/i18n-provider", () => ({
  useI18n: () => ({
    t: (key: string, variables?: Record<string, string | number>) => {
      if (key === "sync.noErrorDetails") return "No technical details were recorded for this sync error.";
      if (key === "common.resyncIn") return `Resync in ${variables?.count}s`;
      if (key === "sync.error") return "Some cloud changes could not sync.";
      if (key === "copy.technicalDetails") return "Technical details";
      if (key === "common.retry") return "Retry now";
      return key;
    },
  }),
}));

import { SyncErrorBanner } from "@/components/app-shell/sync-error-banner";

describe("SyncErrorBanner", () => {
  it.each([null, ""] as const)("shows an expanded technical-details disclosure when no reason was recorded", (error) => {
    render(<SyncErrorBanner error={error} countdown={3} onRetry={vi.fn()} />);

    const summary = screen.getByText("Technical details");
    expect((summary.parentElement as HTMLDetailsElement).open).toBe(true);
    expect(screen.getByText("No technical details were recorded for this sync error.")).toBeTruthy();
    expect(screen.getByText("Resync in 3s")).toBeTruthy();
  });

  it("shows the recorded failure and keeps manual retry available", () => {
    const onRetry = vi.fn();
    render(<SyncErrorBanner error="Storage policy denied this upload" countdown={null} onRetry={onRetry} />);

    expect(screen.getByText("Storage policy denied this upload")).toBeTruthy();
    expect((screen.getByText("Technical details").parentElement as HTMLDetailsElement).open).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Retry now" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
