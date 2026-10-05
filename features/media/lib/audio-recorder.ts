/** Longest voice note a member can record. About 480 KB at 32 kbps. */
export const VOICE_NOTE_MAX_DURATION_MS = 120_000;

const AUDIO_MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"] as const;
const AUDIO_BITS_PER_SECOND = 32_000;
const CHUNK_INTERVAL_MS = 1000;

export interface RecordedAudio {
  blob: Blob;
  /** Base MIME type without codec parameters, as stored in tripMedia. */
  contentType: string;
  durationMs: number;
}

interface MediaRecorderLike {
  state: string;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  start(timeslice?: number): void;
  pause(): void;
  resume(): void;
  stop(): void;
}

interface MediaRecorderConstructor {
  new (stream: MediaStream, options?: MediaRecorderOptions): MediaRecorderLike;
  isTypeSupported(type: string): boolean;
}

export interface AudioRecorderDeps {
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  MediaRecorder: MediaRecorderConstructor;
  now(): number;
}

export function pickAudioMimeType(isTypeSupported: (type: string) => boolean): string | null {
  return AUDIO_MIME_CANDIDATES.find((type) => isTypeSupported(type)) ?? null;
}

export function baseAudioType(mimeType: string): string {
  return mimeType.split(";")[0].trim().toLowerCase();
}

export function audioExtension(contentType: string): string {
  switch (baseAudioType(contentType)) {
    case "audio/mp4":
      return "m4a";
    case "audio/ogg":
      return "ogg";
    case "audio/mpeg":
      return "mp3";
    default:
      return "webm";
  }
}

/** Browser support only; native shells hide the mic until they declare microphone use. */
export function isAudioRecordingSupported(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  if (!window.isSecureContext || typeof navigator.mediaDevices?.getUserMedia !== "function") return false;
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return false;
  return pickAudioMimeType((type) => MediaRecorder.isTypeSupported(type)) !== null;
}

function browserDeps(): AudioRecorderDeps {
  return {
    getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
    MediaRecorder: MediaRecorder as unknown as MediaRecorderConstructor,
    now: () => Date.now(),
  };
}

export class AudioRecorder {
  private recorder: MediaRecorderLike | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private mimeType = "";
  /** Recorded time from finished segments; paused time is never counted. */
  private accumulatedMs = 0;
  /** Start of the running segment, or null while paused. */
  private segmentStartedAt: number | null = null;
  private maxDurationMs = VOICE_NOTE_MAX_DURATION_MS;
  private onAutoStop: ((audio: RecordedAudio) => void) | undefined;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopping: Promise<RecordedAudio> | null = null;

  constructor(private readonly deps: AudioRecorderDeps = browserDeps()) {}

  get isRecording(): boolean {
    return this.recorder !== null;
  }

  get isPaused(): boolean {
    return this.recorder !== null && this.segmentStartedAt === null;
  }

  /** Recorded time so far, excluding pauses and capped at the limit. */
  elapsedMs(): number {
    const running = this.segmentStartedAt === null ? 0 : Math.max(0, this.deps.now() - this.segmentStartedAt);
    return Math.min(this.accumulatedMs + running, this.maxDurationMs);
  }

  async start(options: { maxDurationMs: number; onAutoStop?: (audio: RecordedAudio) => void }): Promise<void> {
    if (this.recorder) throw new Error("A recording is already in progress");
    const mimeType = pickAudioMimeType((type) => this.deps.MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw new Error("Audio recording is not supported on this device");

    const stream = await this.deps.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    let recorder: MediaRecorderLike;
    try {
      recorder = new this.deps.MediaRecorder(stream, { mimeType, audioBitsPerSecond: AUDIO_BITS_PER_SECOND });
    } catch (error) {
      for (const track of stream.getTracks()) track.stop();
      throw error;
    }
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    };
    this.stream = stream;
    this.recorder = recorder;
    this.chunks = [];
    this.mimeType = mimeType;
    this.maxDurationMs = options.maxDurationMs;
    this.onAutoStop = options.onAutoStop;
    this.accumulatedMs = 0;
    this.segmentStartedAt = this.deps.now();
    recorder.start(CHUNK_INTERVAL_MS);
    this.armTimer();
  }

  pause(): void {
    const recorder = this.recorder;
    if (!recorder || this.stopping || this.segmentStartedAt === null || recorder.state !== "recording") return;
    recorder.pause();
    this.accumulatedMs = this.elapsedMs();
    this.segmentStartedAt = null;
    this.clearTimer();
  }

  resume(): void {
    const recorder = this.recorder;
    if (!recorder || this.stopping || this.segmentStartedAt !== null || recorder.state !== "paused") return;
    recorder.resume();
    this.segmentStartedAt = this.deps.now();
    this.armTimer();
  }

  stop(): Promise<RecordedAudio> {
    if (this.stopping) return this.stopping;
    const recorder = this.recorder;
    if (!recorder) return Promise.reject(new Error("No recording in progress"));
    this.clearTimer();
    const durationMs = this.elapsedMs();
    this.accumulatedMs = durationMs;
    this.segmentStartedAt = null;
    this.stopping = new Promise((resolve) => {
      const finish = () => {
        const contentType = baseAudioType(this.mimeType);
        const blob = new Blob(this.chunks, { type: contentType });
        this.release();
        resolve({ blob, contentType, durationMs });
      };
      if (recorder.state === "inactive") {
        finish();
        return;
      }
      recorder.onstop = finish;
      recorder.stop();
    });
    return this.stopping;
  }

  cancel(): void {
    const recorder = this.recorder;
    if (!recorder) return;
    recorder.onstop = null;
    recorder.ondataavailable = null;
    if (recorder.state !== "inactive") recorder.stop();
    this.release();
  }

  private armTimer() {
    this.clearTimer();
    const onAutoStop = this.onAutoStop;
    this.timer = setTimeout(() => {
      this.stop().then((audio) => onAutoStop?.(audio), () => undefined);
    }, Math.max(0, this.maxDurationMs - this.accumulatedMs));
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private release() {
    this.clearTimer();
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
    this.stopping = null;
    this.accumulatedMs = 0;
    this.segmentStartedAt = null;
    this.onAutoStop = undefined;
  }
}
