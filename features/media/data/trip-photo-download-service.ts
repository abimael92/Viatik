import type { TripMedia } from "@/features/domain/entities-media";
import { getCurrentDatabase } from "@/lib/db/dexie";
import { downloadRemoteMedia } from "@/lib/sync/cloud-sync";
import {
  downloadBulkPhotos,
  type BulkPhotoDownloadResult,
  type DownloadablePhoto,
} from "@/features/media/lib/trip-photo-download";

function getMedia(id: string): Promise<TripMedia | undefined> {
  const db = getCurrentDatabase();
  if (!db) throw new Error("No database is open. Wrap calls in DatabaseProvider.");
  return db.tripMedia.get(id);
}

async function getCachedPhoto(item: DownloadablePhoto): Promise<Blob> {
  const media = await getMedia(item.id);
  if (!media || media.kind !== "photo" || media.deletedAt !== null) throw new Error("Shared photo is no longer available.");
  if (media.blob instanceof Blob) return media.blob;
  const blob = await downloadRemoteMedia(media.storagePath);
  if (!blob.type.startsWith("image/") || blob.size > 10 * 1024 * 1024) throw new Error("Downloaded content is not a supported photo.");
  const db = getCurrentDatabase();
  if (!db) throw new Error("No database is open. Wrap calls in DatabaseProvider.");
  const current = await db.tripMedia.get(media.id);
  if (!current || current.deletedAt !== null) throw new Error("Shared photo is no longer available.");
  await db.tripMedia.update(media.id, { blob, byteSize: blob.size, contentType: blob.type || media.contentType });
  return blob;
}

export async function downloadPhoto(id: string): Promise<Blob> {
  return getCachedPhoto({ id, byteSize: 0 });
}

export function savePhotoBlob(blob: Blob, name: string): void {
  const filename = name.replace(/[\\/\u0000-\u001f\u007f]/g, "_").trim() || "trip-photo";
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function downloadPhotosSequentially<TPhoto extends TripMedia>(
  items: TPhoto[],
  save: (item: TPhoto, blob: Blob) => void = (item, blob) => savePhotoBlob(blob, item.caption || `trip-photo-${item.id}`),
): Promise<BulkPhotoDownloadResult<TPhoto>> {
  return downloadBulkPhotos<TPhoto, Blob>(
    items,
    async (item) => {
      const blob = await getCachedPhoto(item);
      return { byteSize: blob.size, value: blob };
    },
    (item, blob) => {
      if (!(blob instanceof Blob)) throw new Error("Photo download could not be prepared.");
      save(item, blob);
    },
  );
}
