"use client";

import { useState, useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import imageCompression from "browser-image-compression";
import { ImagePlus, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import { db } from "@/lib/db/dexie";
import { Button } from "@/components/ui/button";
import type { TripMedia } from "@/features/domain/entities-media";

interface TripGalleryProps {
  tripId: string;
  activityId?: string | null;
}

const COMPRESSION_OPTIONS = {
  maxSizeMB: 0.5,
  maxWidthOrHeight: 1600,
  useWebWorker: true,
};

export function TripGallery({ tripId, activityId = null }: TripGalleryProps) {
  const [compressing, setCompressing] = useState(false);
  const media = useLiveQuery(
    () =>
      db.tripMedia
        .where("tripId")
        .equals(tripId)
        .filter(
          (m) => m.activityId === activityId && m.deletedAt === null
        )
        .reverse()
        .sortBy("createdAt"),
    [tripId, activityId]
  );

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files) return;
      setCompressing(true);

      try {
        const now = new Date().toISOString();
        for (const file of Array.from(files)) {
          const compressed = await imageCompression(file, COMPRESSION_OPTIONS);
          const mediaItem: TripMedia = {
            id: crypto.randomUUID(),
            tripId,
            activityId,
            caption: file.name,
            blob: compressed,
            uploadedUrl: null,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          };
          await db.tripMedia.add(mediaItem);
        }
      } catch (err) {
        console.error("Image compression failed", err);
      } finally {
        setCompressing(false);
      }
    },
    [tripId, activityId]
  );

  const handleDelete = useCallback(async (id: string) => {
    await db.tripMedia.update(id, { deletedAt: new Date().toISOString() });
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Gallery</h3>
        <label className="cursor-pointer">
          <input
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
      </div>

      <div className="grid grid-cols-2 gap-3 @md:grid-cols-3 @xl:grid-cols-4">
        <AnimatePresence>
          {(media ?? []).map((item) => (
            <GalleryImage key={item.id} item={item} onDelete={handleDelete} />
          ))}
        </AnimatePresence>
      </div>

      {(media ?? []).length === 0 && (
        <p className="text-sm text-muted-foreground">
          No photos yet. Add some and they will be available offline after compression.
        </p>
      )}
    </div>
  );
}

function GalleryImage({
  item,
  onDelete,
}: {
  item: TripMedia;
  onDelete: (id: string) => void;
}) {
  const objectUrl = URL.createObjectURL(item.blob);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-muted"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={objectUrl}
        alt={item.caption ?? "Trip photo"}
        className="h-full w-full object-cover"
      />
      <button
        onClick={() => onDelete(item.id)}
        className="absolute right-2 top-2 rounded-full bg-background/80 p-1.5 opacity-0 transition-opacity group-hover:opacity-100"
        aria-label="Delete photo"
      >
        <Trash2 className="size-4 text-destructive" />
      </button>
    </motion.div>
  );
}
