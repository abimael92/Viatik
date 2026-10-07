"use client";

import { useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import imageCompression from "browser-image-compression";
import { Check, ChevronLeft, ChevronRight, Download, ImagePlus, RotateCcw, Share2, Trash2, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { TripMedia } from "@/features/domain/entities-media";
import type { StagedTripMedia } from "@/features/domain/entities-staged-media";
import { mediaRepository } from "@/features/media/data/dexie-media-repository";
import { stagedTripMediaRepository } from "@/features/media/data/staged-trip-media-repository";
import { downloadPhoto, downloadPhotosSequentially, savePhotoBlob } from "@/features/media/data/trip-photo-download-service";
import { extractCaptureDate } from "@/features/media/lib/exif";
import { useSyncStatus } from "@/lib/sync/use-sync-status";
import { useI18n } from "@/lib/i18n/i18n-provider";

interface TripGalleryProps {
  tripId: string;
  userId: string;
  canEdit?: boolean;
  activityId?: string | null;
  autoOpen?: boolean;
  onAutoOpened?: () => void;
}

const COMPRESSION_OPTIONS = {
  maxSizeMB: 0.5,
  maxWidthOrHeight: 1600,
  useWebWorker: true,
};

type GalleryFilter = "all" | "today" | "day";

const FILTER_LABELS: Record<GalleryFilter, string> = {
  all: "All",
  today: "Today",
  day: "By Day",
};

const NO_DATE_LABEL = "No date / Older";

export function TripGallery({ tripId, userId, activityId = null, autoOpen = false, onAutoOpened }: TripGalleryProps) {
  const { t } = useI18n();
  const [compressing, setCompressing] = useState(false);
  const [media, setMedia] = useState<TripMedia[] | null>(null);
  const [staged, setStaged] = useState<StagedTripMedia[]>([]);
  const [stagedSelection, setStagedSelection] = useState<string[]>([]);
  const [sharedSelection, setSharedSelection] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [failedDownloads, setFailedDownloads] = useState<TripMedia[]>([]);
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<{ id: string; shared: boolean } | null>(null);
  const [filter, setFilter] = useState<GalleryFilter>("all");
  const [lightbox, setLightbox] = useState<{ open: boolean; index: number }>({ open: false, index: 0 });
  const autoOpenConsumed = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sync = useSyncStatus();

  useEffect(() => mediaRepository.watchByTrip(tripId, activityId, setMedia), [tripId, activityId]);
  useEffect(() => stagedTripMediaRepository.watchByTrip(tripId, setStaged), [tripId]);

  useLayoutEffect(() => {
    if (!autoOpen) {
      autoOpenConsumed.current = false;
      return;
    }
    if (autoOpen && !autoOpenConsumed.current) {
      autoOpenConsumed.current = true;
      fileInputRef.current?.click();
      onAutoOpened?.();
    }
  }, [autoOpen, onAutoOpened]);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files) return;
      setCompressing(true);
      setProgress(0);
      setError(null);

      try {
        const selected = Array.from(files);
        for (const [index, file] of selected.entries()) {
          const captureDate = await extractCaptureDate(file);
          const compressed = await imageCompression(file, COMPRESSION_OPTIONS);
          const stagedPhoto = await stagedTripMediaRepository.stage({
            id: crypto.randomUUID(),
            tripId,
            activityId,
            caption: file.name,
            blob: compressed,
            createdBy: userId,
            takenAt: captureDate.slice(0, 10),
          });
          setStagedSelection((current) => [...new Set([...current, stagedPhoto.id])]);
          setProgress(Math.round(((index + 1) / selected.length) * 100));
        }
      } catch {
        setError(t("common.photoStageFailed"));
      } finally {
        setCompressing(false);
      }
    },
    [tripId, userId, activityId, t]
  );

  const handleShare = useCallback(async () => {
    if (stagedSelection.length === 0) return;
    setSharing(true);
    setError(null);
    try {
      await stagedTripMediaRepository.share(stagedSelection);
      setStagedSelection([]);
    } catch {
      setError(t("common.photoShareFailed"));
    } finally {
      setSharing(false);
    }
  }, [stagedSelection, t]);

  const confirmRemoval = useCallback(async () => {
    if (!pendingRemoval) return;
    const target = pendingRemoval;
    setPendingRemoval(null);
    try {
      if (target.shared) {
        await stagedTripMediaRepository.unshare(target.id);
        setSharedSelection((current) => current.filter((id) => id !== target.id));
      } else {
        await stagedTripMediaRepository.discard(target.id);
        setStagedSelection((current) => current.filter((id) => id !== target.id));
      }
    } catch {
      setError(target.shared ? t("common.photoUnshareFailed") : t("common.photoDiscardFailed"));
    }
  }, [pendingRemoval, t]);

  const handleDownload = useCallback(async (item: TripMedia) => {
    setDownloading(true);
    setDownloadError(null);
    try {
      const blob = await downloadPhoto(item.id);
      savePhotoBlob(blob, item.caption || `trip-photo-${item.id}`);
      setFailedDownloads((current) => current.filter((failed) => failed.id !== item.id));
      setDownloadStatus(t("common.photoDownloadComplete"));
    } catch {
      setDownloadError(t("common.photoDownloadFailed"));
    } finally {
      setDownloading(false);
    }
  }, [t]);

  const handleBulkDownload = useCallback(async (items: TripMedia[]) => {
    setDownloading(true);
    setDownloadError(null);
    setDownloadStatus(t("common.photoDownloadProgress"));
    try {
      const result = await downloadPhotosSequentially(items);
      setFailedDownloads(result.failed.map(({ item }) => item));
      setDownloadStatus(t("common.bulkPhotoDownloadSummary", {
        downloaded: result.downloaded.length,
        failed: result.failed.length,
        skipped: result.skipped.length,
      }));
    } catch {
      setDownloadError(t("common.photoDownloadFailed"));
    } finally {
      setDownloading(false);
    }
  }, [t]);

  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const groups = useMemo(() => {
    if (filter !== "day") return [];
    const byDate = new Map<string, TripMedia[]>();
    for (const item of media ?? []) {
      const label = item.takenAt ?? NO_DATE_LABEL;
      const bucket = byDate.get(label);
      if (bucket) bucket.push(item);
      else byDate.set(label, [item]);
    }
    return Array.from(byDate.entries())
      .sort((a, b) => {
        if (a[0] === NO_DATE_LABEL) return 1;
        if (b[0] === NO_DATE_LABEL) return -1;
        return b[0].localeCompare(a[0]);
      })
      .map(([label, items]) => ({ label, items }));
  }, [media, filter]);

  const visibleItems = useMemo(() => {
    if (filter === "today") return (media ?? []).filter((item) => item.takenAt === todayKey);
    if (filter === "day") return groups.flatMap((group) => group.items);
    return media ?? [];
  }, [media, filter, todayKey, groups]);

  const currentItem = useMemo(() => visibleItems[lightbox.index], [visibleItems, lightbox.index]);
  const currentUrl = useMemo(() => {
    if (!currentItem) return "";
    return currentItem.blob ? URL.createObjectURL(currentItem.blob) : currentItem.uploadedUrl ?? "";
  }, [currentItem]);

  useEffect(() => {
    return () => {
      if (currentUrl && currentItem?.blob) URL.revokeObjectURL(currentUrl);
    };
  }, [currentUrl, currentItem?.blob]);

  const openLightbox = (index: number) => setLightbox({ open: true, index });

  const previous = useCallback(() => {
    const length = visibleItems.length || 1;
    setLightbox((current) => ({ ...current, index: (current.index - 1 + length) % length }));
  }, [visibleItems.length]);

  const next = useCallback(() => {
    const length = visibleItems.length || 1;
    setLightbox((current) => ({ ...current, index: (current.index + 1) % length }));
  }, [visibleItems.length]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      previous();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      next();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{t("common.gallery")}</h3>
        <label className="cursor-pointer">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            multiple
            className="sr-only"
            aria-label={t("common.stagePhotosPrivately")}
            onChange={(e) => { void handleFiles(e.target.files); e.currentTarget.value = ""; }}
            disabled={compressing}
          />
          <Button asChild variant="outline" className="min-h-11 border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100" disabled={compressing}>
            <span>
              <ImagePlus className="size-5" aria-hidden="true" />
              {compressing ? t("common.compressing") : t("common.stagePhotosPrivately")}
            </span>
          </Button>
        </label>
      </div>

      {compressing && <div role="status" aria-live="polite" className="rounded-lg bg-muted p-3 text-sm">{t("common.compressing")} {progress}%</div>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {downloadStatus && <p role="status" aria-live="polite" className="text-sm">{downloadStatus}</p>}
      {downloadError && <p role="alert" className="text-sm text-destructive">{downloadError}</p>}
      {(media ?? []).some((item) => item.uploadStatus !== "uploaded") && <p role="status" aria-live="polite" className="text-xs text-muted-foreground">{sync.isOnline ? t("common.photosBackground") : t("common.photosOffline")}</p>}

      {staged.length > 0 && (
        <section className="space-y-3 rounded-xl border border-border bg-muted/40 p-4" aria-labelledby="staged-trip-photos-heading">
          <div>
            <h4 id="staged-trip-photos-heading" className="font-semibold">{t("common.stagedPhotos")}</h4>
            <p className="text-sm text-muted-foreground">{t("common.privateDraftNote")}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 @md:grid-cols-3 @xl:grid-cols-4">
            {staged.map((item) => (
              <StagedGalleryImage
                key={item.id}
                item={item}
                selected={stagedSelection.includes(item.id)}
                onSelect={(selected) => setStagedSelection((current) => selected ? [...new Set([...current, item.id])] : current.filter((id) => id !== item.id))}
                onDiscard={() => setPendingRemoval({ id: item.id, shared: false })}
              />
            ))}
          </div>
          <Button onClick={() => void handleShare()} disabled={sharing || stagedSelection.length === 0}>
            <Share2 className="size-5" aria-hidden="true" />
            {sharing ? t("common.sharingPhotos") : t("common.shareSelectedPhotos", { count: stagedSelection.length })}
          </Button>
        </section>
      )}

      {media === null && <div role="status" className="h-32 animate-pulse rounded-xl bg-muted" aria-label={t("common.loadingGallery")} />}

      {media !== null && media.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => void handleBulkDownload(media.filter((item) => item.kind === "photo"))} disabled={downloading || media.length === 0}>
            <Download className="size-5" aria-hidden="true" />{t("common.downloadAllPhotos")}
          </Button>
          <Button variant="outline" onClick={() => void handleBulkDownload(media.filter((item) => sharedSelection.includes(item.id)))} disabled={downloading || sharedSelection.length === 0}>
            {t("common.downloadSelectedPhotos", { count: sharedSelection.length })}
          </Button>
          <Button variant="ghost" onClick={() => setSharedSelection(sharedSelection.length === visibleItems.length ? [] : visibleItems.map((item) => item.id))} aria-pressed={visibleItems.length > 0 && sharedSelection.length === visibleItems.length}>
            {sharedSelection.length === visibleItems.length && visibleItems.length > 0 ? t("common.clearPhotoSelection") : t("common.selectVisiblePhotos")}
          </Button>
        </div>
      )}
      {failedDownloads.length > 0 && (
        <section className="space-y-2 rounded-lg border border-destructive/40 p-3" aria-label={t("common.failedPhotoDownloads")}>
          <p className="text-sm">{t("common.failedPhotoDownloads")}</p>
          <ul className="flex flex-wrap gap-2">
            {failedDownloads.map((item) => (
              <li key={item.id}>
                <Button variant="outline" disabled={downloading} onClick={() => void handleDownload(item)}>
                  <RotateCcw className="size-4" aria-hidden="true" />{t("common.retryPhotoDownload", { name: item.caption || item.id })}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {media !== null && media.length > 0 && (
        <div className="flex w-fit rounded-md border p-0.5" role="group" aria-label={t("common.galleryView")}>
          {(Object.keys(FILTER_LABELS) as GalleryFilter[]).map((option) => (
            <Button key={option} variant={filter === option ? "default" : "ghost"} onClick={() => setFilter(option)} aria-pressed={filter === option}>
              {option === "all" ? t("common.all") : option === "today" ? t("common.today") : FILTER_LABELS.day}
            </Button>
          ))}
        </div>
      )}

      {media !== null && filter === "day" && groups.length > 0 && (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.label} className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">{group.label}</h4>
              <div className="grid grid-cols-2 gap-3 @md:grid-cols-3 @xl:grid-cols-4">
                {group.items.map((item) => (
                  <GalleryImage
                    key={item.id}
                    item={item}
                    canUnshare={item.createdBy === userId}
                    canRetry={item.createdBy === userId}
                    selected={sharedSelection.includes(item.id)}
                    downloading={downloading}
                    onSelect={(selected) => setSharedSelection((current) => selected ? [...new Set([...current, item.id])] : current.filter((id) => id !== item.id))}
                    onUnshare={() => setPendingRemoval({ id: item.id, shared: true })}
                    onDownload={() => void handleDownload(item)}
                    onRetry={(id) => mediaRepository.retry(id)}
                    onOpen={() => openLightbox(visibleItems.indexOf(item))}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {media !== null && (filter !== "day" || groups.length === 0) && visibleItems.length > 0 && (
        <div key={filter} className="grid grid-cols-2 gap-3 @md:grid-cols-3 @xl:grid-cols-4">
          <AnimatePresence>
            {visibleItems.map((item, index) => (
              <GalleryImage
                key={item.id}
                item={item}
                canUnshare={item.createdBy === userId}
                canRetry={item.createdBy === userId}
                selected={sharedSelection.includes(item.id)}
                downloading={downloading}
                onSelect={(selected) => setSharedSelection((current) => selected ? [...new Set([...current, item.id])] : current.filter((id) => id !== item.id))}
                onUnshare={() => setPendingRemoval({ id: item.id, shared: true })}
                onDownload={() => void handleDownload(item)}
                onRetry={(id) => mediaRepository.retry(id)}
                onOpen={() => openLightbox(index)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {media !== null && media.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("common.noPhotosOffline")}</p>
      )}

      {media !== null && media.length > 0 && visibleItems.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("common.noPhotosView")}</p>
      )}

      <ConfirmDialog
        open={pendingRemoval !== null}
        onOpenChange={(open) => { if (!open) setPendingRemoval(null); }}
        title={pendingRemoval?.shared ? t("common.unsharePhoto") : t("common.discardPrivatePhoto")}
        description={pendingRemoval?.shared ? t("common.unsharePhotoConfirm") : t("common.discardPrivatePhotoConfirm")}
        confirmLabel={pendingRemoval?.shared ? t("common.unsharePhoto") : t("common.discardPhoto")}
        onConfirm={() => { void confirmRemoval(); }}
      />

      <Dialog open={lightbox.open} onOpenChange={(open) => setLightbox((current) => ({ ...current, open }))}>
        <DialogContent className="max-w-5xl border-0 bg-transparent p-0 shadow-none" onKeyDown={handleKeyDown}>
          <DialogTitle className="sr-only">{t("common.photoPreview")}</DialogTitle>
          <DialogDescription className="sr-only">{t("common.photoBrowseHelp")}</DialogDescription>
          <div className="relative flex items-center justify-center">
            {currentItem && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={currentUrl}
                alt={currentItem.caption ?? t("common.tripPhoto")}
                className="max-h-[85vh] max-w-full rounded-lg object-contain"
              />
            )}
            <button
              type="button"
              onClick={previous}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-3 text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t("common.previousPhoto")}
            >
              <ChevronLeft className="size-6" />
            </button>
            <button
              type="button"
              onClick={next}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-3 text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t("common.nextPhoto")}
            >
              <ChevronRight className="size-6" />
            </button>
          </div>
          {currentItem?.caption && <p className="mt-2 text-center text-sm text-white">{currentItem.caption}</p>}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StagedGalleryImage({
  item,
  selected,
  onSelect,
  onDiscard,
}: {
  item: StagedTripMedia;
  selected: boolean;
  onSelect: (selected: boolean) => void;
  onDiscard: () => void;
}) {
  const { t } = useI18n();
  const objectUrl = useMemo(() => URL.createObjectURL(item.blob), [item.blob]);
  useEffect(() => () => URL.revokeObjectURL(objectUrl), [objectUrl]);

  return (
    <div className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-muted">
      <Image src={objectUrl} fill sizes="(max-width: 768px) 50vw, 25vw" unoptimized alt={item.caption ?? t("common.tripPhoto")} className="object-cover" />
      <label className="absolute left-2 top-2 flex min-h-11 min-w-11 items-center justify-center rounded-md bg-background/90 p-2">
        <input type="checkbox" checked={selected} onChange={(event) => onSelect(event.currentTarget.checked)} aria-label={t("common.selectStagedPhoto", { name: item.caption ?? item.id })} />
      </label>
      <span className="absolute inset-x-2 bottom-2 truncate rounded bg-background/90 px-2 py-1 text-xs">{item.caption ?? t("common.privateDraft")}</span>
      <Button type="button" variant="destructive" size="icon" onClick={onDiscard} className="absolute right-2 top-2 size-11" aria-label={t("common.discardPhoto")}>
        <Trash2 className="size-5" aria-hidden="true" />
      </Button>
    </div>
  );
}

function GalleryImage({
  item,
  canUnshare,
  canRetry,
  selected,
  downloading,
  onSelect,
  onUnshare,
  onDownload,
  onRetry,
  onOpen,
}: {
  item: TripMedia;
  canUnshare: boolean;
  canRetry: boolean;
  selected: boolean;
  downloading: boolean;
  onSelect: (selected: boolean) => void;
  onUnshare: () => void;
  onDownload: () => void;
  onRetry: (id: string) => void;
  onOpen: () => void;
}) {
  const { t } = useI18n();
  const objectUrl = useMemo(() => item.blob ? URL.createObjectURL(item.blob) : item.uploadedUrl ?? "", [item.blob, item.uploadedUrl]);
  useEffect(() => () => { if (item.blob && objectUrl) URL.revokeObjectURL(objectUrl); }, [item.blob, objectUrl]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-muted"
    >
      <button
        type="button"
        onClick={onOpen}
        className="h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        aria-label={t("common.viewPhoto", { name: item.caption ?? t("common.tripPhoto") })}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={objectUrl}
          alt={item.caption ?? t("common.tripPhoto")}
          className="h-full w-full object-cover"
        />
      </button>
      <label className="absolute left-2 top-2 flex min-h-11 min-w-11 items-center justify-center rounded-md bg-background/90 p-2">
        <input type="checkbox" checked={selected} onChange={(event) => onSelect(event.currentTarget.checked)} aria-label={t("common.selectSharedPhoto", { name: item.caption ?? item.id })} />
      </label>
      <Button type="button" variant="secondary" size="icon" onClick={onDownload} disabled={downloading} className="absolute bottom-2 left-2 size-11" aria-label={t("common.downloadPhoto", { name: item.caption ?? item.id })}>
        <Download className="size-5" aria-hidden="true" />
      </Button>
      {canRetry && item.uploadStatus === "failed" && <Button type="button" variant="secondary" size="icon" onClick={() => onRetry(item.id)} className="absolute right-2 top-14 size-11" aria-label={t("common.retryUpload")} title={item.uploadError ?? t("common.uploadFailed")}><RotateCcw className="size-5" aria-hidden="true" /></Button>}
      {item.uploadStatus === "uploading" && <div className="absolute inset-x-2 bottom-2 h-1.5 overflow-hidden rounded-full bg-background/70"><div className="h-full bg-primary" style={{ width: `${item.uploadProgress}%` }} /></div>}
      {canUnshare && <Button
        type="button"
        variant="destructive"
        size="icon"
        onClick={onUnshare}
        className="absolute right-2 top-2 size-11"
        aria-label={t("common.unsharePhoto")}
      >
        <X className="size-5" aria-hidden="true" />
      </Button>}
      {selected && <span className="absolute bottom-2 right-2 rounded-full bg-primary p-1 text-primary-foreground" aria-hidden="true"><Check className="size-4" /></span>}
    </motion.div>
  );
}
