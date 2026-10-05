import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { VoiceRecorder, type VoiceRecorderProps } from "@/features/media/components/voice-recorder";

afterEach(cleanup);

function renderRecorder(props: Partial<VoiceRecorderProps> = {}) {
  const handlers = {
    onStart: vi.fn(),
    onPause: vi.fn(),
    onResume: vi.fn(),
    onStop: vi.fn(),
    onCancel: vi.fn(),
  };
  render(<VoiceRecorder status="idle" elapsedMs={0} maxDurationMs={120_000} {...handlers} {...props} />);
  return handlers;
}

describe("VoiceRecorder", () => {
  it("starts recording from the microphone button", () => {
    const handlers = renderRecorder();

    fireEvent.click(screen.getByRole("button", { name: "Record voice note" }));

    expect(handlers.onStart).toHaveBeenCalledOnce();
    expect(screen.queryByRole("timer")).toBeNull();
  });

  it("disables the microphone while the recorder is starting", () => {
    renderRecorder({ status: "starting" });

    expect(screen.getByRole("button", { name: "Record voice note" })).toHaveProperty("disabled", true);
  });

  it("shows the live timer against the limit with pause, save and discard", () => {
    const handlers = renderRecorder({ status: "recording", elapsedMs: 15_400 });

    const timer = screen.getByRole("timer");
    expect(timer.textContent).toBe("00:15 / 02:00");
    expect(timer.getAttribute("aria-label")).toBe("00:15 of 02:00 recorded");
    expect(screen.getByText("Recording…")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Pause recording" }));
    fireEvent.click(screen.getByRole("button", { name: "Stop and save" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel recording" }));

    expect(handlers.onPause).toHaveBeenCalledOnce();
    expect(handlers.onStop).toHaveBeenCalledOnce();
    expect(handlers.onCancel).toHaveBeenCalledOnce();
  });

  it("offers resume while paused", () => {
    const handlers = renderRecorder({ status: "paused", elapsedMs: 30_000 });

    expect(screen.getByText("Paused")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Pause recording" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Resume recording" }));

    expect(handlers.onResume).toHaveBeenCalledOnce();
  });

  it("warns when the limit is close", () => {
    renderRecorder({ status: "recording", elapsedMs: 112_100 });

    expect(screen.getByText("8s left")).toBeTruthy();
  });
});
