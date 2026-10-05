import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import type { MediaTranscript } from "@/features/domain/entities-media";
import { TranscriptPanel, TranscriptToggle } from "@/features/media/components/voice-transcript";

afterEach(cleanup);

function Harness({ transcript }: { transcript: MediaTranscript | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TranscriptToggle open={open} controls="transcript" onToggle={() => setOpen((value) => !value)} />
      <TranscriptPanel id="transcript" open={open} transcript={transcript} />
    </>
  );
}

const done: MediaTranscript = { mediaId: "media-1", tripId: "trip-1", status: "done", text: "Meet at the market at nine.", language: "en", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", version: 1 };

describe("voice note transcript", () => {
  it("expands and collapses the transcript", () => {
    const { container } = render(<Harness transcript={done} />);
    const panel = container.querySelector("#transcript") as HTMLElement;

    const show = screen.getByRole("button", { name: "Show transcript" });
    expect(show.getAttribute("aria-expanded")).toBe("false");
    expect(show.getAttribute("aria-controls")).toBe("transcript");
    expect(panel.hasAttribute("inert")).toBe(true);

    fireEvent.click(show);
    const hide = screen.getByRole("button", { name: "Hide transcript" });
    expect(hide.getAttribute("aria-expanded")).toBe("true");
    expect(panel.hasAttribute("inert")).toBe(false);
    expect(screen.getByText("Meet at the market at nine.")).toBeTruthy();
    expect(screen.getByText("Auto-transcribed · EN")).toBeTruthy();

    fireEvent.click(hide);
    expect(screen.getByRole("button", { name: "Show transcript" })).toBeTruthy();
    expect(panel.hasAttribute("inert")).toBe(true);
  });

  it.each([
    [null, "No transcript yet. It will appear here once the note is transcribed."],
    [{ ...done, status: "pending", text: null }, "Transcribing…"],
    [{ ...done, status: "processing", text: null }, "Transcribing…"],
    [{ ...done, status: "failed", text: null }, "Transcript unavailable"],
    [{ ...done, status: "done", text: "  " }, "Transcript unavailable"],
    [{ ...done, status: "skipped", text: null }, "Daily transcription limit reached"],
  ] as const)("shows the %o state", (transcript, message) => {
    render(<TranscriptPanel id="transcript" open transcript={transcript as MediaTranscript | null} />);

    expect(screen.getByText(message)).toBeTruthy();
  });
});
