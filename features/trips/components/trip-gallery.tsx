"use client";

import { useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import imageCompression from "browser-image-compression";
import { ChevronLeft, ChevronRight, ImagePlus, RotateCcw, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { TripMedia } from "@/features/domain/entities-media";
import { mediaRepository } from "@/features/media/data/dexie-media-repository";
import { useSyncStatus } from "@/lib/sync/use-sync-status";

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

export function TripGallery({ tripId, userId, canEdit = true, activityId = null, autoOpen = false, onAutoOpened }: TripGalleryProps) {
  const [compressing, setCompressing] = useState(false);
  const [media, setMedia] = useState<TripMedia[] | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ open: boolean; index: number }>({ open: false, index: 0 });
  const autoOpenConsumed = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sync = useSyncStatus();

  useEffect(() => mediaRepository.watchByTrip(tripId, activityId, setMedia), [tripId, activityId]);

  useLayoutEffect(() => {
    if (!autoOpen) {
      autoOpenConsumed.current = false;
      return;
    }
    if (autoOpen && canEdit && !autoOpenConsumed.current) {
      autoOpenConsumed.current = true;
      fileInputRef.current?.click();
      onAutoOpened?.();
    } else if (autoOpen && !canEdit) {
      onAutoOpened?.();
    }
  }, [autoOpen, canEdit, onAutoOpened]);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files) return;
      setCompressing(true);
      setProgress(0);
      setError(null);

      try {
        const selected = Array.from(files);
        for (const [index, file] of selected.entries()) {
          const compressed = await imageCompression(file, COMPRESSION_OPTIONS);
          await mediaRepository.create({ id: crypto.randomUUID(), tripId, activityId, caption: file.name, blob: compressed, createdBy: userId });
          setProgress(Math.round(((index + 1) / selected.length) * 100));
        }
      } catch {
        setError("A photo could not be compressed. Try a smaller image.");
      } finally {
        setCompressing(false);
      }
    },
    [tripId, userId, activityId]
  );

  const handleDelete = useCallback((id: string) => mediaRepository.remove(id), []);

  const currentItem = useMemo(() => (media ?? [])[lightbox.index], [media, lightbox.index]);
  const currentUrl = useMemo(() => {
    if (!currentItem) return "";
    return currentItem.uploadedUrl ?? (currentItem.blob ? URL.createObjectURL(currentItem.blob) : "");
  }, [currentItem]);

  useEffect(() => {
    return () => {
      if (currentUrl && !currentItem?.uploadedUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [currentUrl, currentItem?.uploadedUrl]);

  const openLightbox = (index: number) => setLightbox({ open: true, index });

  const previous = useCallback(() => {
    const length = (media ?? []).length || 1;
    setLightbox((current) => ({ ...current, index: (current.index - 1 + length) % length }));
  }, [media]);

  const next = useCallback(() => {
    const length = (media ?? []).length || 1;
    setLightbox((current) => ({ ...current, index: (current.index + 1) % length }));
  }, [media]);

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
        <h3 className="text-lg font-semibold">Gallery</h3>
        {canEdit && (
          <label className="cursor-pointer">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(e) => handleFiles(e.target.files)}
              disabled={compressing}
            />
            <Button asChild variant="outline" size="sm" disabled={compressing}>
              <span>
                <ImagePlus className="size-4" />
                {compressing ? "Compressing..." : "Add photos"}
              </span>
            </Button>
          </label>
        )}
      </div>

      {compressing && <div role="status" className="rounded-lg bg-muted p-3 text-sm">Compressing photos… {progress}%</div>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {(media ?? []).some((item) => item.uploadStatus !== "uploaded") && <p className="text-xs text-muted-foreground">{sync.isOnline ? "Photos upload automatically in the background." : "Photos are safe on this device and will upload when online."}</p>}

      {media === null && <div role="status" className="h-32 animate-pulse rounded-xl bg-muted" aria-label="Loading gallery" />}

      <div className="grid grid-cols-2 gap-3 @md:grid-cols-3 @xl:grid-cols-4">
        <AnimatePresence>
          {(media ?? []).map((item, index) => (
            <GalleryImage key={item.id} item={item} canEdit={canEdit} onDelete={handleDelete} onRetry={(id) => mediaRepository.retry(id)} onOpen={() => openLightbox(index)} />
          ))}
        </AnimatePresence>
      </div>

      {(media ?? []).length === 0 && media !== null && (
        <p className="text-sm text-muted-foreground">
          {canEdit ? "No photos yet. Add some and they will be available offline after compression." : "No photos yet."}
        </p>
      )}

      <Dialog open={lightbox.open} onOpenChange={(open) => setLightbox((current) => ({ ...current, open }))}>
        <DialogContent className="max-w-5xl border-0 bg-transparent p-0 shadow-none" onKeyDown={handleKeyDown}>
          <DialogTitle className="sr-only">Photo preview</DialogTitle>
          <DialogDescription className="sr-only">Use the left and right arrow keys to browse photos. Press Escape to close.</DialogDescription>
          <div className="relative flex items-center justify-center">
            {currentItem && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={currentUrl}
                alt={currentItem.caption ?? "Trip photo"}
                className="max-h-[85vh] max-w-full rounded-lg object-contain"
              />
            )}
            <button
              type="button"
              onClick={previous}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-3 text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Previous photo"
            >
              <ChevronLeft className="size-6" />
            </button>
            <button
              type="button"
              onClick={next}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-3 text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Next photo"
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

function GalleryImage({
  item,
  canEdit,
  onDelete,
  onRetry,
  onOpen,
}: {
  item: TripMedia;
  canEdit: boolean;
  onDelete: (id: string) => void;
  onRetry: (id: string) => void;
  onOpen: () => void;
}) {
  const objectUrl = useMemo(() => item.uploadedUrl ?? (item.blob ? URL.createObjectURL(item.blob) : ""), [item.blob, item.uploadedUrl]);
  useEffect(() => () => { if (!item.uploadedUrl && objectUrl) URL.revokeObjectURL(objectUrl); }, [item.uploadedUrl, objectUrl]);

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
        aria-label={`View ${item.caption ?? "trip photo"} in lightbox`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={objectUrl}
          alt={item.caption ?? "Trip photo"}
          className="h-full w-full object-cover"
        />
      </button>
      {canEdit && item.uploadStatus === "failed" && <button onClick={() => onRetry(item.id)} className="absolute left-2 top-2 rounded-full bg-background/90 p-1.5" aria-label="Retry photo upload" title={item.uploadError ?? "Upload failed"}><RotateCcw className="size-4" /></button>}
      {item.uploadStatus === "uploading" && <div className="absolute inset-x-2 bottom-2 h-1.5 overflow-hidden rounded-full bg-background/70"><div className="h-full bg-primary" style={{ width: `${item.uploadProgress}%` }} /></div>}
      {canEdit && <button
        onClick={() => onDelete(item.id)}
        className="absolute right-2 top-2 rounded-full bg-background/80 p-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        aria-label="Delete photo"
      >
        <Trash2 className="size-4 text-destructive" />
      </button>}
    </motion.div>
  );
}
