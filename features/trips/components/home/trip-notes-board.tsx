"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { StickyNote, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { TripMedia } from "@/features/domain/entities-media";
import { VoiceRecorder } from "@/features/media/components/voice-recorder";
import { mediaRepository } from "@/features/media/data/dexie-media-repository";
import { VOICE_NOTE_MAX_DURATION_MS, type RecordedAudio } from "@/features/media/lib/audio-recorder";
import { useAudioRecorder } from "@/features/media/lib/use-audio-recorder";
import { VoiceNoteCard } from "@/features/trips/components/home/voice-note-card";
import { tripNoteRepository } from "@/features/trips/data/dexie-trip-note-repository";
import { TRIP_NOTE_MAX_LENGTH, type TripNote } from "@/features/trips/domain/trip-note";
import { localizeThrownError } from "@/lib/i18n/localize-error";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { validateNote } from "@/lib/validation/common";

const DISCARD_CONFIRM_AFTER_MS = 5_000;

/** Upload status changes re-emit rows with a new Blob instance; keep the old one so playback isn't reset. */
function keepClipIdentity(previous: Map<string, TripMedia>, rows: TripMedia[]): Map<string, TripMedia> {
  return new Map(
    rows.map((row) => {
      const before = previous.get(row.id)?.blob;
      const sameClip = before && row.blob && before.size === row.blob.size && before.type === row.blob.type;
      return [row.id, sameClip ? { ...row, blob: before } : row];
    })
  );
}

export function TripNotesBoard({ tripId, userId }: { tripId: string; userId: string }) {
  const { t } = useI18n();
  const [notes, setNotes] = useState<TripNote[]>([]);
  const [audioMedia, setAudioMedia] = useState<Map<string, TripMedia>>(new Map());
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<TripNote | null>(null);
  const [editText, setEditText] = useState("");

  useEffect(() => tripNoteRepository.watchByTrip(tripId, setNotes), [tripId]);

  const audioIdsKey = useMemo(
    () => notes.flatMap((note) => (note.audioMediaId ? [note.audioMediaId] : [])).join(","),
    [notes]
  );
  useEffect(
    () =>
      mediaRepository.watchByIds(audioIdsKey ? audioIdsKey.split(",") : [], (rows) =>
        setAudioMedia((previous) => keepClipIdentity(previous, rows))
      ),
    [audioIdsKey]
  );

  const saveVoiceNote = useCallback(
    async (audio: RecordedAudio) => {
      setSaving(true);
      setError(null);
      try {
        await tripNoteRepository.createVoiceNote({
          id: crypto.randomUUID(),
          tripId,
          userId,
          content: draft,
          audio: { mediaId: crypto.randomUUID(), ...audio },
        });
        setDraft("");
      } catch (cause) {
        setError(localizeThrownError(cause, t, "copy.unableSaveNote"));
      } finally {
        setSaving(false);
      }
    },
    [draft, t, tripId, userId]
  );

  const recorder = useAudioRecorder({ maxDurationMs: VOICE_NOTE_MAX_DURATION_MS, onRecorded: saveVoiceNote });
  const recording = recorder.status === "recording" || recorder.status === "paused";
  const textNotes = notes.filter((note) => !note.audioMediaId);
  const voiceNotes = notes.filter((note) => note.audioMediaId);

  function cancelRecording() {
    if (recorder.elapsedMs > DISCARD_CONFIRM_AFTER_MS && !window.confirm(t("copy.discardRecordingConfirm"))) return;
    recorder.cancel();
  }

  async function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const issue = validateNote(draft);
    if (issue) {
      setError(t(issue.key, issue.variables));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await tripNoteRepository.create({
        id: crypto.randomUUID(),
        tripId,
        userId,
        content: draft,
      });
      setDraft("");
    } catch (cause) {
      setError(localizeThrownError(cause, t, "copy.unableSaveNote"));
    } finally {
      setSaving(false);
    }
  }

  function openNote(note: TripNote) {
    setSelected(note);
    setEditText(note.content);
    setError(null);
  }

  async function saveEdit() {
    if (!selected || saving) return;
    const issue = selected.audioMediaId && !editText.trim() ? null : validateNote(editText);
    if (issue) {
      setError(t(issue.key, issue.variables));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await tripNoteRepository.update(selected.id, userId, editText);
      setSelected(null);
    } catch (cause) {
      setError(localizeThrownError(cause, t, "copy.unableSaveNote"));
    } finally {
      setSaving(false);
    }
  }

  async function removeNote() {
    if (!selected || saving) return;
    setSaving(true);
    setError(null);
    try {
      await tripNoteRepository.remove(selected.id, userId);
      setSelected(null);
    } catch (cause) {
      setError(localizeThrownError(cause, t, "copy.unableSaveNote"));
    } finally {
      setSaving(false);
    }
  }

  const draftError = error ?? (recorder.error ? t(recorder.error) : null);
  const recorderWidget = (
    <VoiceRecorder
      status={recorder.status}
      elapsedMs={recorder.elapsedMs}
      maxDurationMs={VOICE_NOTE_MAX_DURATION_MS}
      disabled={saving}
      onStart={() => void recorder.start()}
      onPause={recorder.pause}
      onResume={recorder.resume}
      onStop={() => void recorder.stop()}
      onCancel={cancelRecording}
    />
  );

  return (
    <section className="rounded-2xl border bg-card p-5 text-card-foreground sm:p-6" aria-labelledby="trip-notes-heading">
      <div className="flex items-center gap-2">
        <StickyNote className="size-5 text-viatik-magenta" aria-hidden />
        <h2 id="trip-notes-heading" className="text-base font-semibold text-foreground">
          {t("copy.tripNotes")}
        </h2>
      </div>
      {recording ? (
        <div className="mt-4">{recorderWidget}</div>
      ) : (
        <form onSubmit={addNote} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor="trip-note-draft">
            {t("copy.notePlaceholder")}
          </label>
          <Input
            id="trip-note-draft"
            value={draft}
            maxLength={TRIP_NOTE_MAX_LENGTH}
            placeholder={t("copy.notePlaceholder")}
            aria-label={t("copy.notePlaceholder")}
            aria-invalid={Boolean(draftError && !selected)}
            aria-describedby={draftError && !selected ? "trip-note-draft-error" : undefined}
            onChange={(event) => setDraft(event.target.value)}
            className="bg-background text-foreground"
          />
          <div className="flex gap-2">
            {recorder.supported ? recorderWidget : null}
            <Button type="submit" variant="primary" disabled={saving || !draft.trim()} className="flex-1 sm:flex-none">
              {t("copy.addNote")}
            </Button>
          </div>
        </form>
      )}
      {draftError && !selected ? (
        <p id="trip-note-draft-error" role="alert" className="mt-2 text-sm text-destructive">
          {draftError}
        </p>
      ) : null}
      {textNotes.length > 0 ? (
        <ul className="mt-4 flex gap-3 overflow-x-auto pb-1" aria-label={t("copy.tripNotes")}>
          {textNotes.map((note) => (
            <li key={note.id} className="min-w-56 max-w-xs shrink-0">
              <button
                type="button"
                onClick={() => openNote(note)}
                aria-label={t("copy.editNoteLabel", { note: note.content })}
                className="h-full w-full rounded-xl border bg-background p-3 text-left text-sm font-medium text-foreground transition-colors hover:border-viatik-magenta/30 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {note.content}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {voiceNotes.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-3" aria-label={t("copy.voiceNotes")}>
          {voiceNotes.map((note) => (
            <li key={note.id}>
              <VoiceNoteCard
                note={note}
                media={note.audioMediaId ? (audioMedia.get(note.audioMediaId) ?? null) : null}
                userId={userId}
                onEdit={() => openNote(note)}
              />
            </li>
          ))}
        </ul>
      ) : null}
      <Dialog open={selected != null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("copy.editNote")}</DialogTitle>
            <DialogDescription>{t("copy.notePlaceholder")}</DialogDescription>
          </DialogHeader>
          <label className="sr-only" htmlFor="trip-note-edit">
            {t("copy.notePlaceholder")}
          </label>
          <textarea
            id="trip-note-edit"
            value={editText}
            maxLength={TRIP_NOTE_MAX_LENGTH}
            aria-label={t("copy.notePlaceholder")}
            aria-invalid={Boolean(error && selected)}
            aria-describedby={error && selected ? "trip-note-edit-error" : undefined}
            onChange={(event) => setEditText(event.target.value)}
            className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {error && selected ? (
            <p id="trip-note-edit-error" role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => void removeNote()} disabled={saving}>
              <Trash2 className="size-4" aria-hidden />
              {t("copy.deleteNote")}
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => void saveEdit()}
              disabled={saving || (!selected?.audioMediaId && !editText.trim())}
            >
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
