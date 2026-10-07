export const MAX_BULK_DOWNLOAD_COUNT = 25;
export const MAX_BULK_DOWNLOAD_BYTES = 250_000_000;

export interface DownloadablePhoto {
  id: string;
  byteSize: number;
}

export interface PhotoDownloadFailure<TPhoto extends DownloadablePhoto> {
  item: TPhoto;
  error: string;
}

export interface BulkPhotoDownloadResult<TPhoto extends DownloadablePhoto> {
  downloaded: TPhoto[];
  failed: PhotoDownloadFailure<TPhoto>[];
  skipped: TPhoto[];
  bytesDownloaded: number;
}

export interface DownloadedPhoto<TValue> {
  byteSize: number;
  value: TValue;
}

export function downloadBulkPhotos<TPhoto extends DownloadablePhoto, TValue = unknown>(
  items: TPhoto[],
  download: (item: TPhoto) => Promise<number | void | DownloadedPhoto<TValue>>,
): Promise<BulkPhotoDownloadResult<TPhoto>>;
export function downloadBulkPhotos<TPhoto extends DownloadablePhoto, TValue>(
  items: TPhoto[],
  download: (item: TPhoto) => Promise<DownloadedPhoto<TValue>>,
  save: (item: TPhoto, value: TValue) => void | Promise<void>,
): Promise<BulkPhotoDownloadResult<TPhoto>>;
export async function downloadBulkPhotos<TPhoto extends DownloadablePhoto, TValue = unknown>(
  items: TPhoto[],
  download: (item: TPhoto) => Promise<number | void | DownloadedPhoto<TValue>>,
  save?: (item: TPhoto, value: TValue) => void | Promise<void>,
): Promise<BulkPhotoDownloadResult<TPhoto>> {
  const result: BulkPhotoDownloadResult<TPhoto> = { downloaded: [], failed: [], skipped: [], bytesDownloaded: 0 };
  const seen = new Set<string>();
  const unique = items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });

  for (let index = 0; index < unique.length; index += 1) {
    const item = unique[index];
    if (result.downloaded.length + result.failed.length >= MAX_BULK_DOWNLOAD_COUNT) {
      result.skipped.push(...unique.slice(index));
      break;
    }
    const estimatedBytes = Number.isFinite(item.byteSize) && item.byteSize > 0 ? item.byteSize : 0;
    if (result.bytesDownloaded + estimatedBytes > MAX_BULK_DOWNLOAD_BYTES) {
      result.skipped.push(...unique.slice(index));
      break;
    }
    try {
      const downloaded = await download(item);
      const actualBytes = typeof downloaded === "object" && downloaded !== null ? downloaded.byteSize : downloaded;
      const value = typeof downloaded === "object" && downloaded !== null ? downloaded.value : undefined;
      const size = typeof actualBytes === "number" && Number.isFinite(actualBytes) && actualBytes >= 0 ? actualBytes : estimatedBytes;
      if (result.bytesDownloaded + size > MAX_BULK_DOWNLOAD_BYTES) {
        result.skipped.push(...unique.slice(index));
        break;
      }
      await save?.(item, value as TValue);
      result.bytesDownloaded += size;
      result.downloaded.push(item);
    } catch (cause) {
      result.failed.push({ item, error: cause instanceof Error ? cause.message : "Photo download failed." });
    }
  }
  return result;
}
