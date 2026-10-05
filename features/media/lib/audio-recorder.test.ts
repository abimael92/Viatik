import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AudioRecorder,
  audioExtension,
  baseAudioType,
  pickAudioMimeType,
  VOICE_NOTE_MAX_DURATION_MS,
} from "@/features/media/lib/audio-recorder";

class FakeMediaRecorder {
  static supported = new Set(["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"]);
  static instances: FakeMediaRecorder[] = [];
  static isTypeSupported(type: string) {
    return FakeMediaRecorder.supported.has(type);
  }

  state: "inactive" | "recording" | "paused" = "inactive";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  timeslice: number | undefined;

  constructor(
    readonly stream: MediaStream,
    readonly options: MediaRecorderOptions,
  ) {
    FakeMediaRecorder.instances.push(this);
  }

  start(timeslice?: number) {
    this.state = "recording";
    this.timeslice = timeslice;
  }

  pause() {
    this.state = "paused";
  }

  resume() {
    this.state = "recording";
  }

  emit(text: string) {
    this.ondataavailable?.({ data: new Blob([text]) });
  }

  stop() {
    this.state = "inactive";
    this.onstop?.();
  }
}

function fakeStream() {
  const track = { stop: vi.fn() };
  return { stream: { getTracks: () => [track] } as unknown as MediaStream, track };
}

describe("audio format negotiation", () => {
  it("prefers webm/opus, then mp4, then ogg/opus", () => {
    expect(pickAudioMimeType(() => true)).toBe("audio/webm;codecs=opus");
    expect(pickAudioMimeType((type) => type !== "audio/webm;codecs=opus")).toBe("audio/mp4");
    expect(pickAudioMimeType((type) => type === "audio/ogg;codecs=opus")).toBe("audio/ogg;codecs=opus");
    expect(pickAudioMimeType(() => false)).toBeNull();
  });

  it("stores the base MIME type and a matching extension", () => {
    expect(baseAudioType("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(baseAudioType("audio/mp4")).toBe("audio/mp4");
    expect(audioExtension("audio/webm")).toBe("webm");
    expect(audioExtension("audio/mp4")).toBe("m4a");
    expect(audioExtension("audio/ogg")).toBe("ogg");
    expect(audioExtension("audio/mpeg")).toBe("mp3");
  });
});

describe("AudioRecorder", () => {
  let now = 0;

  beforeEach(() => {
    vi.useFakeTimers();
    now = 1_000;
    FakeMediaRecorder.instances = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function recorder(getUserMedia = vi.fn(async () => fakeStream().stream)) {
    return {
      getUserMedia,
      recorder: new AudioRecorder({
        getUserMedia,
        MediaRecorder: FakeMediaRecorder as never,
        now: () => now,
      }),
    };
  }

  it("records mono low-bitrate audio in 1 s chunks and returns one blob with its duration", async () => {
    const { stream, track } = fakeStream();
    const { recorder: audio, getUserMedia } = recorder(vi.fn(async () => stream));

    await audio.start({ maxDurationMs: VOICE_NOTE_MAX_DURATION_MS });
    const media = FakeMediaRecorder.instances[0];
    expect(getUserMedia).toHaveBeenCalledWith({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    expect(media.options).toEqual({ mimeType: "audio/webm;codecs=opus", audioBitsPerSecond: 32_000 });
    expect(media.timeslice).toBe(1000);

    media.emit("chunk-1");
    media.emit("chunk-2");
    now = 4_500;
    const result = await audio.stop();

    expect(result.contentType).toBe("audio/webm");
    expect(result.durationMs).toBe(3_500);
    expect(result.blob.type).toBe("audio/webm");
    expect(await result.blob.text()).toBe("chunk-1chunk-2");
    expect(track.stop).toHaveBeenCalled();
  });

  it("stops automatically at the duration cap", async () => {
    const { recorder: audio } = recorder();
    const onAutoStop = vi.fn();

    await audio.start({ maxDurationMs: 120_000, onAutoStop });
    FakeMediaRecorder.instances[0].emit("voice");
    now += 130_000;
    await vi.advanceTimersByTimeAsync(120_000);

    expect(onAutoStop).toHaveBeenCalledWith(expect.objectContaining({ durationMs: 120_000, contentType: "audio/webm" }));
    expect(FakeMediaRecorder.instances[0].state).toBe("inactive");
  });

  it("excludes paused time from the duration and the cap", async () => {
    const { recorder: audio } = recorder();
    const onAutoStop = vi.fn();

    await audio.start({ maxDurationMs: 10_000, onAutoStop });
    now += 4_000;
    audio.pause();
    expect(audio.isPaused).toBe(true);
    expect(FakeMediaRecorder.instances[0].state).toBe("paused");
    now += 60_000;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(onAutoStop).not.toHaveBeenCalled();
    expect(audio.elapsedMs()).toBe(4_000);

    audio.resume();
    expect(audio.isPaused).toBe(false);
    now += 2_000;
    expect(audio.elapsedMs()).toBe(6_000);
    now += 4_000;
    await vi.advanceTimersByTimeAsync(6_000);

    expect(onAutoStop).toHaveBeenCalledWith(expect.objectContaining({ durationMs: 10_000 }));
  });

  it("can stop while paused", async () => {
    const { recorder: audio } = recorder();

    await audio.start({ maxDurationMs: 120_000 });
    FakeMediaRecorder.instances[0].emit("voice");
    now += 3_000;
    audio.pause();
    now += 30_000;

    await expect(audio.stop()).resolves.toMatchObject({ durationMs: 3_000 });
  });

  it("discards audio and releases the microphone on cancel", async () => {
    const { stream, track } = fakeStream();
    const { recorder: audio } = recorder(vi.fn(async () => stream));
    const onAutoStop = vi.fn();

    await audio.start({ maxDurationMs: 120_000, onAutoStop });
    audio.cancel();
    await vi.advanceTimersByTimeAsync(120_000);

    expect(track.stop).toHaveBeenCalled();
    expect(onAutoStop).not.toHaveBeenCalled();
    await expect(audio.stop()).rejects.toThrow();
  });

  it("refuses to start when no supported format exists", async () => {
    FakeMediaRecorder.supported = new Set();
    const { recorder: audio, getUserMedia } = recorder();
    try {
      await expect(audio.start({ maxDurationMs: 1_000 })).rejects.toThrow();
      expect(getUserMedia).not.toHaveBeenCalled();
    } finally {
      FakeMediaRecorder.supported = new Set(["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"]);
    }
  });
});
