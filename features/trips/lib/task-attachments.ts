import imageCompression from "browser-image-compression";

import { mediaRepository } from "@/features/media/data/dexie-media-repository";

const COMPRESSION_OPTIONS = {
  maxSizeMB: 0.5,
  maxWidthOrHeight: 1600,
  useWebWorker: true,
};

/** Compress images with the gallery uploader and store their media paths. */
export async function storeTaskImages(files: File[], tripId: string, userId: string): Promise<string[]> {
  const paths: string[] = [];
  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    const compressed = await imageCompression(file, COMPRESSION_OPTIONS);
    const media = await mediaRepository.create({
      id: crypto.randomUUID(),
      tripId,
      activityId: null,
      caption: file.name,
      blob: compressed,
      createdBy: userId,
    });
    paths.push(media.storagePath);
  }
  return paths;
}

export function mediaIdFromStoragePath(path: string): string | null {
  const file = path.split("/").pop() ?? "";
  const id = file.replace(/\.[a-z0-9]+$/i, "");
  return id || null;
}
