"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Pause, Play, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatClock } from "@/features/media/lib/format-clock";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { cn } from "@/lib/utils";

export const PLAYBACK_SPEEDS = [1, 1.5, 2] as const;

/** Starting one clip pauses every other player on the page. */
const PLAY_EVENT = "viatik:voice-note-play";

function speedLabel(speed: number): string {
  return `${speed}x`;
}

function finiteMs(seconds: number): number | null {
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
}

export interface VoiceNotePlayerProps {
  src: string;
  /** Stored clip length. Preferred over the element's duration, which MediaRecorder WebM files report as Infinity. */
  durationMs: number | null;
  preload?: "none" | "metadata";
  className?: string;
}

export function VoiceNotePlayer({ src, durationMs, preload = "metadata", className }: VoiceNotePlayerProps) {
  const { t } = useI18n();
  const audioRef = useRef<HTMLAudioElement>(null);
  const probingDurationRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [mediaDurationMs, setMediaDurationMs] = useState<number | null>(null);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  const totalMs = durationMs ?? mediaDurationMs ?? 0;
  const shownMs = totalMs > 0 ? Math.min(currentMs, totalMs) : currentMs;
  const progress = totalMs > 0 ? (shownMs / totalMs) * 100 : 0;
  const speed = PLAYBACK_SPEEDS[speedIndex];

  useEffect(() => {
    const pauseOthers = (event: Event) => {
      const audio = audioRef.current;
      if (audio && (event as CustomEvent<HTMLAudioElement>).detail !== audio) audio.pause();
    };
    document.addEventListener(PLAY_EVENT, pauseOthers);
    return () => document.removeEventListener(PLAY_EVENT, pauseOthers);
  }, []);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      const audio = audioRef.current;
      if (audio && !probingDurationRef.current) setCurrentMs(audio.currentTime * 1000);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    setFailed(false);
    audio.playbackRate = speed;
    const played = audio.play();
    played?.catch((cause: unknown) => {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setPlaying(false);
      setFailed(true);
    });
  }

  function stop() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setCurrentMs(0);
  }

  function cycleSpeed() {
    const next = (speedIndex + 1) % PLAYBACK_SPEEDS.length;
    setSpeedIndex(next);
    const audio = audioRef.current;
    if (audio) {
      audio.playbackRate = PLAYBACK_SPEEDS[next];
      audio.defaultPlaybackRate = PLAYBACK_SPEEDS[next];
    }
  }

  function seek(event: ChangeEvent<HTMLInputElement>) {
    const ms = Number(event.target.value);
    const audio = audioRef.current;
    if (audio) audio.currentTime = ms / 1000;
    setCurrentMs(ms);
  }

  function onLoadedMetadata() {
    const audio = audioRef.current;
    if (!audio) return;
    const known = finiteMs(audio.duration);
    if (known !== null) {
      setMediaDurationMs(known);
      return;
    }
    // Chrome can't seek a MediaRecorder WebM until it has scanned to the end once.
    probingDurationRef.current = true;
    audio.currentTime = Number.MAX_SAFE_INTEGER;
  }

  function onDurationChange() {
    const audio = audioRef.current;
    if (!audio) return;
    const known = finiteMs(audio.duration);
    if (known === null) return;
    setMediaDurationMs(known);
    if (probingDurationRef.current) {
      probingDurationRef.current = false;
      audio.currentTime = 0;
    }
  }

  function onTimeUpdate() {
    const audio = audioRef.current;
    if (audio && !probingDurationRef.current) setCurrentMs(audio.currentTime * 1000);
  }

  function onPlay() {
    setPlaying(true);
    document.dispatchEvent(new CustomEvent(PLAY_EVENT, { detail: audioRef.current }));
  }

  function onEnded() {
    setPlaying(false);
    setCurrentMs(0);
    if (audioRef.current) audioRef.current.currentTime = 0;
  }

  function onEmptied() {
    setPlaying(false);
    setCurrentMs(0);
  }

  const current = formatClock(shownMs);
  const total = formatClock(totalMs);
  const atStart = !playing && shownMs === 0;

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex items-center gap-1.5">
        <audio
          ref={audioRef}
          src={src}
          preload={preload}
          className="hidden"
          onLoadedMetadata={onLoadedMetadata}
          onDurationChange={onDurationChange}
          onTimeUpdate={onTimeUpdate}
          onPlay={onPlay}
          onPause={() => setPlaying(false)}
          onEnded={onEnded}
          onEmptied={onEmptied}
          onError={() => {
            setPlaying(false);
            setFailed(true);
          }}
        />
        <Button
          type="button"
          variant="primary"
          size="icon"
          onClick={togglePlay}
          aria-label={playing ? t("copy.pauseVoiceNote") : t("copy.playVoiceNote")}
          title={playing ? t("copy.pauseVoiceNote") : t("copy.playVoiceNote")}
          className="shrink-0 rounded-full"
        >
          {playing ? <Pause className="fill-current" aria-hidden /> : <Play className="translate-x-px fill-current" aria-hidden />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={stop}
          disabled={atStart}
          aria-label={t("copy.stopVoiceNote")}
          title={t("copy.stopVoiceNote")}
          className="shrink-0 rounded-full text-muted-foreground hover:text-foreground"
        >
          <Square className="size-4! fill-current" aria-hidden />
        </Button>
        <div className="group relative flex min-h-11 min-w-0 flex-1 flex-col justify-center gap-1 px-1">
          <div className="relative flex h-4 items-center">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-linear-to-r from-viatik-magenta to-viatik-red" style={{ width: `${progress}%` }} />
            </div>
            <span
              aria-hidden
              className="pointer-events-none absolute size-3.5 -translate-x-1/2 rounded-full border border-viatik-magenta/40 bg-white shadow transition-transform group-hover:scale-125 group-has-focus-visible:ring-2 group-has-focus-visible:ring-ring"
              style={{ left: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between font-mono text-[11px] leading-none tabular-nums text-muted-foreground" aria-hidden>
            <span>{current}</span>
            <span>{total}</span>
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(totalMs, 1)}
            step={100}
            value={shownMs}
            onChange={seek}
            disabled={totalMs <= 0}
            aria-label={t("copy.seekVoiceNote")}
            aria-valuetext={t("copy.playbackPosition", { current, total })}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          onClick={cycleSpeed}
          aria-label={t("copy.playbackSpeed", { speed: speedLabel(speed) })}
          title={t("copy.playbackSpeed", { speed: speedLabel(speed) })}
          className="min-w-11 shrink-0 rounded-full px-2 font-mono text-xs tabular-nums"
        >
          {speedLabel(speed)}
        </Button>
      </div>
      {failed ? (
        <p role="alert" className="text-xs text-destructive">
          {t("copy.voiceNotePlaybackFailed")}
        </p>
      ) : null}
    </div>
  );
}
