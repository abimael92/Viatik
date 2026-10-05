import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VoiceNotePlayer } from "@/features/media/components/voice-note-player";

const playing = new WeakSet<HTMLMediaElement>();
let playImpl: (element: HTMLMediaElement) => Promise<void>;

beforeEach(() => {
  playImpl = async (element) => {
    playing.add(element);
    element.dispatchEvent(new Event("play"));
  };
  Object.defineProperty(HTMLMediaElement.prototype, "paused", {
    configurable: true,
    get(this: HTMLMediaElement) {
      return !playing.has(this);
    },
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
    return playImpl(this);
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (this: HTMLMediaElement) {
    if (!playing.delete(this)) return;
    this.dispatchEvent(new Event("pause"));
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLMediaElement.prototype, "paused");
});

function renderPlayer() {
  const view = render(<VoiceNotePlayer src="blob:clip" durationMs={42_000} />);
  return { ...view, audio: view.container.querySelector("audio") as HTMLAudioElement };
}

describe("VoiceNotePlayer", () => {
  it("renders custom controls instead of the native audio player", () => {
    const { audio } = renderPlayer();

    expect(audio.getAttribute("src")).toBe("blob:clip");
    expect(audio.hasAttribute("controls")).toBe(false);
    expect(screen.getByRole("button", { name: "Play voice note" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Stop and rewind" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("slider", { name: "Playback position" }).getAttribute("aria-valuetext")).toBe("00:00 of 00:42");
    expect(screen.getByText("00:42")).toBeTruthy();
  });

  it("toggles between play and pause", async () => {
    const { audio } = renderPlayer();

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Play voice note" })));
    expect(audio.play).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Pause voice note" }));
    expect(audio.pause).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Play voice note" })).toBeTruthy();
  });

  it("cycles the playback speed through 1x, 1.5x and 2x", () => {
    const { audio } = renderPlayer();

    const speed = () => screen.getByRole("button", { name: /Playback speed/ });
    expect(speed().textContent).toBe("1x");
    fireEvent.click(speed());
    expect(speed().textContent).toBe("1.5x");
    expect(audio.playbackRate).toBe(1.5);
    fireEvent.click(speed());
    expect(speed().textContent).toBe("2x");
    expect(audio.playbackRate).toBe(2);
    fireEvent.click(speed());
    expect(speed().textContent).toBe("1x");
    expect(speed().getAttribute("aria-label")).toBe("Playback speed 1x. Tap to change.");
  });

  it("seeks with the scrubber and stops back to the start", () => {
    const { audio } = renderPlayer();

    fireEvent.change(screen.getByRole("slider", { name: "Playback position" }), { target: { value: "15000" } });
    expect(audio.currentTime).toBe(15);
    expect(screen.getByText("00:15")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Stop and rewind" }));
    expect(audio.currentTime).toBe(0);
    expect(screen.getAllByText("00:00").length).toBeGreaterThan(0);
  });

  it("rewinds when the clip ends", async () => {
    const { audio } = renderPlayer();

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Play voice note" })));
    fireEvent.ended(audio);

    expect(screen.getByRole("button", { name: "Play voice note" })).toBeTruthy();
    expect(audio.currentTime).toBe(0);
  });

  it("reports a clip that can't be played", async () => {
    playImpl = () => Promise.reject(new DOMException("unsupported", "NotSupportedError"));
    renderPlayer();

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Play voice note" })));

    expect(screen.getByRole("alert").textContent).toBe("Couldn't play this clip.");
  });

  it("pauses other clips when one starts playing", async () => {
    const { container } = render(
      <>
        <VoiceNotePlayer src="blob:first" durationMs={1_000} />
        <VoiceNotePlayer src="blob:second" durationMs={1_000} />
      </>
    );
    const [first, second] = Array.from(container.querySelectorAll("audio"));
    const [playFirst, playSecond] = screen.getAllByRole("button", { name: "Play voice note" });

    await act(async () => fireEvent.click(playFirst));
    await act(async () => fireEvent.click(playSecond));

    expect(first.paused).toBe(true);
    expect(second.paused).toBe(false);
  });
});
