"use client";

import { useEffect, useState, type FormEvent } from "react";
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
import { tripNoteRepository } from "@/features/trips/data/dexie-trip-note-repository";
import { TRIP_NOTE_MAX_LENGTH, type TripNote } from "@/features/trips/domain/trip-note";
import { useI18n } from "@/lib/i18n/i18n-provider";

export function TripNotesBoard({ tripId, userId }: { tripId: string; userId: string }) {
  const { t } = useI18n();
  const [notes, setNotes] = useState<TripNote[]>([]);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<TripNote | null>(null);
  const [editText, setEditText] = useState("");

  useEffect(() => tripNoteRepository.watchByTrip(tripId, setNotes), [tripId]);

  async function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
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
      setError(cause instanceof Error ? cause.message : t("copy.unableSaveNote"));
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
    setSaving(true);
    setError(null);
    try {
      await tripNoteRepository.update(selected.id, userId, editText);
      setSelected(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("copy.unableSaveNote"));
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
      setError(cause instanceof Error ? cause.message : t("copy.unableSaveNote"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-5 text-card-foreground sm:p-6" aria-labelledby="trip-notes-heading">
      <div className="flex items-center gap-2">
        <StickyNote className="size-5 text-viatik-magenta" aria-hidden />
        <h2 id="trip-notes-heading" className="text-base font-semibold text-foreground">
          {t("copy.tripNotes")}
        </h2>
      </div>
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
          onChange={(event) => setDraft(event.target.value)}
          className="bg-background text-foreground"
        />
        <Button type="submit" variant="primary" disabled={saving || !draft.trim()}>
          {t("copy.addNote")}
        </Button>
      </form>
      {error && !selected ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {notes.length > 0 ? (
        <ul className="mt-4 flex gap-3 overflow-x-auto pb-1" aria-label={t("copy.tripNotes")}>
          {notes.map((note) => (
            <li key={note.id} className="min-w-56 max-w-xs shrink-0">
              <button
                type="button"
                onClick={() => openNote(note)}
                aria-label={t("copy.editNoteLabel", { note: note.content })}
                className="h-full w-full rounded-xl border bg-background p-3 text-left text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {note.content}
              </button>
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
            onChange={(event) => setEditText(event.target.value)}
            className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {error && selected ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => void removeNote()} disabled={saving}>
              <Trash2 className="size-4" aria-hidden />
              {t("copy.deleteNote")}
            </Button>
            <Button type="button" variant="primary" onClick={() => void saveEdit()} disabled={saving || !editText.trim()}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
