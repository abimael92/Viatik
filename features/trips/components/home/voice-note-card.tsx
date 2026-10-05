"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Mic, Pencil, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { TripMedia } from "@/features/domain/entities-media";
import { VoiceNotePlayer } from "@/features/media/components/voice-note-player";
import { TranscriptPanel, TranscriptToggle } from "@/features/media/components/voice-transcript";
import { mediaRepository } from "@/features/media/data/dexie-media-repository";
import { formatClock } from "@/features/media/lib/format-clock";
import type { TripNote } from "@/features/trips/domain/trip-note";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { useDatabase } from "@/lib/db/database-provider";

export function VoiceNoteCard({
  note,
  media,
  userId,
  onEdit,
}: {
  note: TripNote;
  media: TripMedia | null;
  userId: string;
  onEdit: () => void;
}) {
  const { t, locale } = useI18n();
  const db = useDatabase();
  const mediaId = note.audioMediaId;
  const transcript = useLiveQuery(
    async () => (mediaId ? await db.mediaTranscripts.get(mediaId) : undefined),
    [db, mediaId]
  );
  const transcriptId = useId();
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const blob = media?.blob ?? null;
  const objectUrl = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }, [objectUrl]);
  const src = objectUrl ?? media?.uploadedUrl ?? null;
  const label = note.content || t("copy.voiceNote");
  const ownClip = media?.createdBy === userId;
  const durationMs = media?.durationMs ?? null;
  const recordedAt = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(note.createdAt));

  let status: string | null = null;
  if (!src) status = t("copy.voiceNoteAvailableOnline");
  else if (ownClip && media?.uploadStatus === "pending") status = t("copy.voiceNoteSavedLocally");
  else if (ownClip && media?.uploadStatus === "uploading") status = t("copy.voiceNoteUploading");
  else if (ownClip && media?.uploadStatus === "failed") status = t("copy.voiceNoteUploadFailed");

  return (
    <article
      aria-label={label}
      className="flex flex-col gap-3 rounded-xl border bg-background p-3 text-sm text-foreground shadow-xs transition-colors hover:border-viatik-magenta/30 sm:p-4"
    >
      <header className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-viatik-magenta/10 text-viatik-magenta" aria-hidden>
          <Mic className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-foreground">{label}</p>
          <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            <time dateTime={note.createdAt}>{recordedAt}</time>
            {durationMs != null ? (
              <>
                <span aria-hidden>·</span>
                <span className="font-mono tabular-nums" aria-label={t("copy.voiceNoteDuration", { duration: formatClock(durationMs) })}>
                  {formatClock(durationMs)}
                </span>
              </>
            ) : null}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onEdit}
          aria-label={t("copy.editNoteLabel", { note: label })}
          title={t("copy.editNote")}
          className="-mr-1.5 -mt-1.5 shrink-0 text-muted-foreground hover:text-foreground"
        >
          <Pencil className="size-4!" aria-hidden />
        </Button>
      </header>
      {src ? <VoiceNotePlayer src={src} durationMs={durationMs} preload={objectUrl ? "metadata" : "none"} /> : null}
      <div className="flex flex-wrap items-center gap-2">
        {src ? (
          <TranscriptToggle open={transcriptOpen} controls={transcriptId} onToggle={() => setTranscriptOpen((open) => !open)} />
        ) : null}
        {status ? (
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {status}
          </span>
        ) : null}
        {ownClip && media?.uploadStatus === "failed" ? (
          <Button type="button" variant="ghost" onClick={() => void mediaRepository.retry(media.id)} className="h-11 px-3 text-xs">
            <RotateCcw className="size-4!" aria-hidden />
            {t("copy.retryUpload")}
          </Button>
        ) : null}
      </div>
      {src ? <TranscriptPanel id={transcriptId} open={transcriptOpen} transcript={transcript ?? null} /> : null}
    </article>
  );
}
