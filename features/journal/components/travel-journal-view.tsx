"use client";

import { localizeThrownError } from "@/lib/i18n/localize-error";

import { Activity as ActivityIcon, BookOpen, Camera, ChevronDown, ChevronUp, CircleDollarSign, CalendarDays, Expand, Footprints, Pencil, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import imageCompression from "browser-image-compression";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Activity, Expense } from "@/features/domain/entities";
import type { TripMedia } from "@/features/domain/entities-media";
import { expenseRepository } from "@/features/expenses/data/dexie-expense-repository";
import { mediaRepository } from "@/features/media/data/dexie-media-repository";
import { formatMinorUnits, parseMinorUnits, type CurrencyCode } from "@/features/domain/money";
import { journalRepository } from "@/features/journal/data/dexie-journal-repository";
import type { JournalDayEntry } from "@/features/journal/domain/journal-types";
import { useTravelJournal } from "@/features/journal/lib/use-travel-journal";
import type { JournalDay } from "@/features/journal/lib/journal-aggregator";
import { useI18n } from "@/lib/i18n/i18n-provider";

/**
 * Travel Journal & Trip Replay for a trip. Aggregates photos, activities, and
 * expenses into a chronological, day-by-day story timeline, topped by a
 * prominent end-of-trip statistics card. All data is read from the local-first
 * Dexie layer, so it works fully offline.
 */
export function TravelJournalView({
  tripId,
  userId,
  baseCurrency,
  startDate,
  endDate,
  canEdit = false,
}: {
  tripId: string;
  userId: string;
  baseCurrency: CurrencyCode;
  startDate: string | null;
  endDate: string | null;
  canEdit?: boolean;
}) {
  const { t } = useI18n();
  const { loading, days, summary } = useTravelJournal(tripId, baseCurrency, startDate, endDate);
  const [entries, setEntries] = useState<JournalDayEntry[]>([]);
  useEffect(() => journalRepository.watchByTrip(tripId, setEntries), [tripId]);
  const entriesByDate = useMemo(() => new Map(entries.map((entry) => [entry.dayDate, entry])), [entries]);
  const timelineDays = useMemo(() => fillTripDays(days, startDate, endDate), [days, startDate, endDate]);

  return (
    <section aria-labelledby="journal-heading" className="space-y-6">
      <div className="flex items-center gap-2">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <BookOpen className="size-5" />
        </span>
        <div>
          <Heading level={2} id="journal-heading" className="text-xl font-bold">
            {t("copy.travelJournal")}
          </Heading>
          <p className="text-sm text-muted-foreground">
            {t("copy.journalDayByDay")}
          </p>
        </div>
      </div>

      <TripReplayCard summary={summary} baseCurrency={baseCurrency} loading={loading} />

      {loading ? (
        <div className="space-y-4">
          {[0, 1].map((item) => (
            <div key={item} className="h-40 animate-pulse rounded-2xl border bg-card" />
          ))}
        </div>
      ) : timelineDays.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <BookOpen className="mx-auto size-8 text-muted-foreground" />
          <Heading level={3} className="mt-3 text-base font-semibold">
            {t("copy.noJournal")}
          </Heading>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("copy.journalEmpty")}
          </p>
        </div>
      ) : (
        <ol className="relative space-y-6 border-l-2 border-border pl-5">
          {timelineDays.map((day) => (
            <li key={day.date} className="relative">
              <span
                aria-hidden
                className="absolute -left-7.25 top-2 grid size-5 place-items-center rounded-full border-2 border-background bg-primary text-primary-foreground"
              >
                <span className="size-1.5 rounded-full bg-current" />
              </span>
              <JournalDayCard day={day} tripId={tripId} userId={userId} canEdit={canEdit} baseCurrency={baseCurrency} experience={entriesByDate.get(day.date)?.experience ?? ""} onSaveExperience={(experience) => journalRepository.save(tripId, day.date, experience)} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function TripReplayCard({
  summary,
  baseCurrency,
  loading,
}: {
  summary: ReturnType<typeof useTravelJournal>["summary"];
  baseCurrency: CurrencyCode;
  loading: boolean;
}) {
  const { t } = useI18n();
  if (loading) {
    return <div className="h-40 animate-pulse rounded-2xl border bg-card" />;
  }

  const stats = [
    { icon: CalendarDays, label: "Days", value: String(summary.totalDays) },
    { icon: Camera, label: t("common.photos"), value: String(summary.totalPhotos) },
    { icon: Footprints, label: t("common.activities"), value: String(summary.totalActivities) },
    { icon: CircleDollarSign, label: t("common.spent"), value: formatMinorUnits(summary.totalSpentMinor, baseCurrency) },
  ];

  return (
    <div className="relative overflow-hidden rounded-2xl border bg-linear-to-br from-viatik-blue/10 via-viatik-magenta/10 to-transparent p-5 sm:p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 -right-16 z-0 size-52 rounded-full bg-linear-to-br from-viatik-blue/10 to-transparent blur-2xl"
      />
      <div className="relative z-10">
        <div className="flex items-center gap-2">
          <Camera className="size-5 text-primary" aria-hidden />
          <Heading level={3} className="text-lg font-bold">
            {t("copy.tripReplay")}
          </Heading>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {summary.totalDays === 1 ? "1 day" : `${summary.totalDays} days`} of {summary.totalPhotos}{" "}
          {summary.totalPhotos === 1 ? "photo" : "photos"} and {summary.totalActivities}{" "}
          {summary.totalActivities === 1 ? "activity" : "activities"} captured so far.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-xl border bg-card/80 p-3">
              <stat.icon className="size-4 text-primary" aria-hidden />
              <p className="mt-2 truncate text-lg font-bold tabular-nums">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function JournalDayCard({ day, tripId, userId, canEdit, baseCurrency, experience, onSaveExperience }: { day: JournalDay; tripId: string; userId: string; canEdit: boolean; baseCurrency: CurrencyCode; experience: string; onSaveExperience: (experience: string) => Promise<unknown> }) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const title = formatJournalDate(day.date);

  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="text-sm font-bold">{title}</h3>
        <span className="text-xs text-muted-foreground">{day.date}</span>
        <span className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {day.photoCount > 0 && (
            <span className="flex items-center gap-1">
              <Camera className="size-3.5" aria-hidden />
              {day.photoCount}
            </span>
          )}
          {day.activityCount > 0 && (
            <span className="flex items-center gap-1">
              <Footprints className="size-3.5" aria-hidden />
              {day.activityCount}
            </span>
          )}
          {day.expenseCount > 0 && (
            <span className="flex items-center gap-1">
              <CircleDollarSign className="size-3.5" aria-hidden />
              {formatMinorUnits(day.totalSpentMinor, baseCurrency)}
            </span>
          )}
          {canEdit && (
            <Button
              type="button"
              variant={editing ? "default" : "outline"}
              size="sm"
              className={!editing ? "border-yellow-300 bg-yellow-50 text-yellow-700 hover:bg-yellow-100" : undefined}
              onClick={() => setEditing((value) => !value)}
            >
              <Pencil className="size-4" /> {editing ? t("copy.done") : t("common.edit")}
            </Button>
          )}
        </span>
      </div>

      <DayExperience key={experience} value={experience} dayDate={day.date} editing={editing} onSave={onSaveExperience} />

      {editing && (
        <div className="mt-3 flex flex-wrap gap-2">
          <AddExpenseControl tripId={tripId} userId={userId} day={day.date} currency={baseCurrency} />
          <AddPhotoControl tripId={tripId} userId={userId} day={day.date} />
        </div>
      )}

      {day.photos.length > 0 && <DayPhotoGallery photos={day.photos} dayDate={day.date} />}

      {day.activities.length > 0 && (
        <ul className="mt-3 space-y-2">
          {day.activities.map((activity) => (
            <ActivityRow key={activity.id} activity={activity} />
          ))}
        </ul>
      )}

      {day.expenses.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-border pt-3">
          {day.expenses.map((expense) => (
            <ExpenseRow key={expense.id} expense={expense} />
          ))}
        </ul>
      )}
    </div>
  );
}

function DayExperience({ value, dayDate, editing, onSave }: { value: string; dayDate: string; editing: boolean; onSave: (value: string) => Promise<unknown> }) {
  const { t } = useI18n();
  const [text, setText] = useState(value);
  const [saved, setSaved] = useState(true);
  if (!editing) {
    return value.trim() ? (
      <p className="mt-4 whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-sm">{value}</p>
    ) : (
      <p className="mt-4 text-sm text-muted-foreground">{t("copy.noNotesDay")}</p>
    );
  }
  return (
    <div className="mt-4 space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={`journal-experience-${dayDate}`} className="text-sm font-semibold">{t("copy.journalPrompt")}</label>
        <span className="text-xs text-muted-foreground" aria-live="polite">{saved ? t("common.offlineSaved") : "Unsaved"}</span>
      </div>
      <textarea id={`journal-experience-${dayDate}`} value={text} onChange={(event) => { setText(event.target.value); setSaved(false); }} onBlur={() => { if (!saved) void onSave(text).then(() => setSaved(true)); }} rows={4} maxLength={4000} placeholder={t("copy.journalPlaceholder")} className="w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring" />
    </div>
  );
}

function AddExpenseControl({ tripId, userId, day, currency }: { tripId: string; userId: string; day: string; currency: CurrencyCode }) {
  const { t } = useI18n();
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!description.trim() || !amount) return;
    setSaving(true);
    setError(null);
    try {
      const amountMinor = parseMinorUnits(amount, currency);
      await expenseRepository.create({
        id: crypto.randomUUID(),
        tripId,
        description: description.trim(),
        amountMinor,
        currency,
        paidBy: userId,
        splitType: "equal",
        date: day,
        createdBy: userId,
        shares: [{ userId, shareAmountMinor: amountMinor, sharePercentage: null, splitType: "equal" }],
      });
      setDescription("");
      setAmount("");
    } catch (cause) {
      setError(localizeThrownError(cause, t, "Unable to add expense."));
    } finally {
      setSaving(false);
    }
  }
  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/40 p-2">
      <div className="space-y-1">
        <Label htmlFor={`journal-expense-${day}`} className="text-xs">{t("copy.expense")}</Label>
        <Input id={`journal-expense-${day}`} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t("copy.placeholderDinner")} className="h-9 w-40" />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`journal-amount-${day}`} className="text-xs">{t("common.amount")}</Label>
        <Input id={`journal-amount-${day}`} value={amount} onChange={(event) => setAmount(event.target.value)} placeholder={`0.00 ${currency}`} inputMode="decimal" className="h-9 w-28" />
      </div>
      <Button type="submit" size="sm" disabled={saving || !description.trim() || !amount}>{saving ? "…" : <Plus className="size-4" />}{t("common.add")}</Button>
      {error && <p className="w-full text-xs text-destructive">{error}</p>}
    </form>
  );
}

function AddPhotoControl({ tripId, userId, day }: { tripId: string; userId: string; day: string }) {
  const { t } = useI18n();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function handleFile(file: File | null) {
    if (!file) return;
    setSaving(true);
    setError(null);
    try {
      const compressed = await imageCompression(file, { maxSizeMB: 2, maxWidthOrHeight: 2000, useWebWorker: true });
      await mediaRepository.create({ id: crypto.randomUUID(), tripId, takenAt: day, blob: compressed, createdBy: userId });
    } catch (cause) {
      setError(localizeThrownError(cause, t, "Unable to add photo."));
    } finally {
      setSaving(false);
    }
  }
  return (
    <div>
      <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-md border border-border/60 px-3 text-sm font-semibold transition-colors hover:bg-muted">
        <Camera className="size-4" /> {saving ? t("common.adding") : "Add photo"}
        <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={saving} onChange={(event) => { void handleFile(event.target.files?.[0] ?? null); event.target.value = ""; }} />
      </label>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function fillTripDays(days: JournalDay[], startDate: string | null, endDate: string | null): JournalDay[] {
  if (!startDate || !endDate || endDate < startDate) return days;
  const byDate = new Map(days.map((day) => [day.date, day]));
  const result: JournalDay[] = [];
  const current = new Date(`${startDate}T12:00:00`);
  const finish = new Date(`${endDate}T12:00:00`);
  while (current <= finish && result.length < 60) {
    const date = current.toISOString().slice(0, 10);
    result.push(byDate.get(date) ?? { date, activities: [], expenses: [], photos: [], totalSpentMinor: 0n, activityCount: 0, photoCount: 0, expenseCount: 0 });
    current.setDate(current.getDate() + 1);
  }
  return result;
}

function ActivityRow({ activity }: { activity: Activity }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
        <ActivityIcon className="size-3.5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium leading-snug">{activity.title}</p>
        {activity.location && <p className="truncate text-xs text-muted-foreground">{activity.location}</p>}
      </div>
    </li>
  );
}

function ExpenseRow({ expense }: { expense: Expense }) {
  return (
    <li className="flex items-center justify-between gap-3 text-sm">
      <span className="min-w-0 truncate">{expense.description}</span>
      <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-muted-foreground">
        {formatMinorUnits(expense.amountMinor, expense.currency)}
      </span>
    </li>
  );
}

function DayPhotoGallery({ photos, dayDate }: { photos: TripMedia[]; dayDate: string }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
          {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          {expanded ? "Hide photos" : `Show photos (${photos.length})`}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setModalOpen(true)}>
          <Expand className="size-4" />{t("common.viewAll")}
        </Button>
      </div>
      {expanded && (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.slice(0, 8).map((photo) => <PhotoThumb key={photo.id} photo={photo} />)}
          {photos.length > 8 && <button type="button" onClick={() => setModalOpen(true)} className="grid aspect-square place-items-center rounded-lg border bg-muted text-sm font-semibold text-muted-foreground hover:text-foreground">+{photos.length - 8} {t("common.more")}</button>}
        </div>
      )}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Photos from {formatJournalDate(dayDate)}</DialogTitle>
            <DialogDescription>{photos.length} {photos.length === 1 ? t("common.photo") : "photos"} uploaded for this day.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((photo) => <PhotoThumb key={photo.id} photo={photo} />)}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PhotoThumb({ photo }: { photo: TripMedia }) {
  const objectUrl = useMemo(
    () => photo.uploadedUrl ?? (photo.blob ? URL.createObjectURL(photo.blob) : ""),
    [photo.blob, photo.uploadedUrl]
  );
  useEffect(
    () => () => {
      if (!photo.uploadedUrl && objectUrl) URL.revokeObjectURL(objectUrl);
    },
    [photo.uploadedUrl, objectUrl]
  );

  if (!objectUrl) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={objectUrl}
      alt={photo.caption ?? "Journal photo"}
      className="aspect-square w-full rounded-lg object-cover"
    />
  );
}

function formatJournalDate(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
