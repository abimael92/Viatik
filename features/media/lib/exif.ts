import * as exifr from "exifr/dist/lite.esm.js";

/**
 * Reads the capture date of an image file.
 *
 * Tries the EXIF `DateTimeOriginal` tag first; if the metadata is missing,
 * stripped, or fails to parse, falls back to the file's lastModified time.
 * Always returns a full ISO-8601 string (`YYYY-MM-DDTHH:mm:ss.sssZ`).
 */
export async function extractCaptureDate(file: File): Promise<string> {
  try {
    const data = await exifr.parse(file, { pick: ["DateTimeOriginal"] });
    const value = data?.DateTimeOriginal;

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString();
    }

    if (typeof value === "string") {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }
  } catch {
    // EXIF missing, stripped, or unreadable — fall through to lastModified.
  }

  return new Date(file.lastModified).toISOString();
}
