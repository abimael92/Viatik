"use client";

import { Capacitor } from "@capacitor/core";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { AudioRecorder, isAudioRecordingSupported, type RecordedAudio } from "@/features/media/lib/audio-recorder";
import type { TranslationKey } from "@/lib/i18n/translations";

export type AudioRecorderStatus = "idle" | "starting" | "recording" | "paused";

const subscribeToNothing = () => () => undefined;

function recordingSupported(): boolean {
  return !Capacitor.isNativePlatform() && isAudioRecordingSupported();
}

function recordingErrorKey(cause: unknown): TranslationKey {
  const name = cause instanceof Error || cause instanceof DOMException ? cause.name : "";
  return name === "NotAllowedError" || name === "SecurityError" ? "copy.microphonePermissionDenied" : "copy.recordingFailed";
}

/**
 * Tap-to-start / tap-to-stop recording with pause. Each recording is a session:
 * a stop, the duration cap, and a cancel race, and only the first one counts.
 */
export function useAudioRecorder({
  maxDurationMs,
  onRecorded,
}: {
  maxDurationMs: number;
  onRecorded: (audio: RecordedAudio) => void | Promise<void>;
}) {
  const supported = useSyncExternalStore(subscribeToNothing, recordingSupported, () => false);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const sessionRef = useRef(0);
  const onRecordedRef = useRef(onRecorded);
  const [status, setStatus] = useState<AudioRecorderStatus>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<TranslationKey | null>(null);

  useEffect(() => {
    onRecordedRef.current = onRecorded;
  }, [onRecorded]);

  useEffect(() => {
    if (status !== "recording") return;
    const interval = setInterval(() => setElapsedMs(recorderRef.current?.elapsedMs() ?? 0), 250);
    return () => clearInterval(interval);
  }, [status]);

  const reset = useCallback(() => {
    setStatus("idle");
    setElapsedMs(0);
  }, []);

  const finish = useCallback(
    (session: number, audio: RecordedAudio) => {
      if (sessionRef.current !== session) return;
      sessionRef.current += 1;
      reset();
      void onRecordedRef.current(audio);
    },
    [reset]
  );

  const cancel = useCallback(() => {
    sessionRef.current += 1;
    recorderRef.current?.cancel();
    reset();
  }, [reset]);

  useEffect(() => {
    const release = () => {
      sessionRef.current += 1;
      recorderRef.current?.cancel();
    };
    window.addEventListener("pagehide", release);
    return () => {
      window.removeEventListener("pagehide", release);
      release();
    };
  }, []);

  const start = useCallback(async () => {
    if (status !== "idle") return;
    const session = ++sessionRef.current;
    const recorder = recorderRef.current ?? new AudioRecorder();
    recorderRef.current = recorder;
    setError(null);
    setStatus("starting");
    try {
      await recorder.start({ maxDurationMs, onAutoStop: (audio) => finish(session, audio) });
    } catch (cause) {
      if (sessionRef.current === session) {
        setError(recordingErrorKey(cause));
        reset();
      }
      return;
    }
    if (sessionRef.current !== session) {
      recorder.cancel();
      return;
    }
    setElapsedMs(0);
    setStatus("recording");
  }, [finish, maxDurationMs, reset, status]);

  const pause = useCallback(() => {
    const recorder = recorderRef.current;
    if (status !== "recording" || !recorder?.isRecording) return;
    recorder.pause();
    if (!recorder.isPaused) return;
    setElapsedMs(recorder.elapsedMs());
    setStatus("paused");
  }, [status]);

  const resume = useCallback(() => {
    const recorder = recorderRef.current;
    if (status !== "paused" || !recorder?.isRecording) return;
    recorder.resume();
    if (recorder.isPaused) return;
    setStatus("recording");
  }, [status]);

  const stop = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder?.isRecording) return;
    const session = sessionRef.current;
    try {
      finish(session, await recorder.stop());
    } catch (cause) {
      setError(recordingErrorKey(cause));
      reset();
    }
  }, [finish, reset]);

  return { supported, status, elapsedMs, error, start, pause, resume, stop, cancel };
}
