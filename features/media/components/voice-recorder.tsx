"use client";

import { Mic, Pause, Play, Square, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatClock } from "@/features/media/lib/format-clock";
import type { AudioRecorderStatus } from "@/features/media/lib/use-audio-recorder";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { cn } from "@/lib/utils";

const LIMIT_WARNING_MS = 10_000;

export interface VoiceRecorderProps {
  status: AudioRecorderStatus;
  elapsedMs: number;
  maxDurationMs: number;
  disabled?: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onCancel: () => void;
}

/**
 * Idle: a single microphone button. Active: the recording bar with a live
 * `00:15 / 02:00` timer, pause/resume, stop-and-save, and discard.
 */
export function VoiceRecorder({
  status,
  elapsedMs,
  maxDurationMs,
  disabled = false,
  onStart,
  onPause,
  onResume,
  onStop,
  onCancel,
}: VoiceRecorderProps) {
  const { t } = useI18n();

  if (status === "idle" || status === "starting") {
    return (
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={onStart}
        disabled={disabled || status === "starting"}
        aria-label={t("copy.recordVoiceNote")}
        title={t("copy.recordVoiceNote")}
        className="shrink-0 hover:border-destructive/50 hover:text-destructive"
      >
        <Mic aria-hidden />
      </Button>
    );
  }

  const paused = status === "paused";
  const remainingMs = Math.max(0, maxDurationMs - elapsedMs);
  const progress = maxDurationMs > 0 ? Math.min(100, (elapsedMs / maxDurationMs) * 100) : 0;
  const elapsed = formatClock(elapsedMs);
  const limit = formatClock(maxDurationMs);

  return (
    <div
      role="group"
      aria-label={t("copy.recordVoiceNote")}
      className={cn(
        "flex flex-col gap-2 rounded-xl border bg-background px-3 py-2 transition-colors",
        paused ? "border-amber-500/40" : "border-destructive/40"
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="relative flex size-3 shrink-0" aria-hidden>
            {paused ? null : (
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-destructive opacity-75 motion-reduce:animate-none" />
            )}
            <span className={cn("relative inline-flex size-3 rounded-full", paused ? "bg-amber-500" : "bg-destructive")} />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="text-xs font-medium text-muted-foreground" aria-live="polite">
              {paused ? t("copy.recordingPaused") : t("copy.recordingVoiceNote")}
            </span>
            <span
              role="timer"
              aria-live="off"
              aria-label={t("copy.recordingProgress", { elapsed, limit })}
              className="font-mono text-base font-semibold tabular-nums text-foreground"
            >
              {elapsed} / {limit}
            </span>
          </div>
          {remainingMs <= LIMIT_WARNING_MS ? (
            <span className="text-xs font-medium text-destructive" aria-live="polite">
              {t("copy.recordingLimitSoon", { seconds: Math.ceil(remainingMs / 1000) })}
            </span>
          ) : null}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onCancel}
            aria-label={t("copy.cancelRecording")}
            title={t("copy.cancelRecording")}
            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 aria-hidden />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={paused ? onResume : onPause}
            aria-label={paused ? t("copy.resumeRecording") : t("copy.pauseRecording")}
            title={paused ? t("copy.resumeRecording") : t("copy.pauseRecording")}
          >
            {paused ? <Play aria-hidden /> : <Pause aria-hidden />}
          </Button>
          <Button type="button" variant="primary" onClick={onStop}>
            <Square className="fill-current" aria-hidden />
            {t("copy.stopRecording")}
          </Button>
        </div>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div
          className={cn("h-full rounded-full transition-[width] duration-300 ease-linear motion-reduce:transition-none", paused ? "bg-amber-500" : "bg-destructive")}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
