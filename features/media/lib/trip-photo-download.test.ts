import { describe, expect, it, vi } from "vitest";

import { downloadBulkPhotos, MAX_BULK_DOWNLOAD_BYTES, MAX_BULK_DOWNLOAD_COUNT } from "@/features/media/lib/trip-photo-download";

const photo = (id: string, byteSize: number) => ({ id, byteSize });

describe("bounded sequential shared-photo downloads", () => {
  it("stops a batch at the first item exceeding the 25-photo or 250 MB cap", async () => {
    const download = vi.fn().mockResolvedValue(1);
    const items = Array.from({ length: MAX_BULK_DOWNLOAD_COUNT + 2 }, (_, index) => photo(`photo-${index}`, 1));

    const result = await downloadBulkPhotos(items, download);

    expect(download).toHaveBeenCalledTimes(MAX_BULK_DOWNLOAD_COUNT);
    expect(result.downloaded).toHaveLength(MAX_BULK_DOWNLOAD_COUNT);
    expect(result.skipped).toHaveLength(2);
    expect(MAX_BULK_DOWNLOAD_BYTES).toBe(250_000_000);
  });

  it("does not begin an item that would exceed the byte cap", async () => {
    const download = vi.fn(async ({ byteSize }: { id: string; byteSize: number }) => byteSize);

    const result = await downloadBulkPhotos([
      photo("large", MAX_BULK_DOWNLOAD_BYTES - 10),
      photo("over-limit", 11),
      photo("later", 1),
    ], download);

    expect(download).toHaveBeenCalledTimes(1);
    expect(result.downloaded.map((item) => item.id)).toEqual(["large"]);
    expect(result.skipped.map((item) => item.id)).toEqual(["over-limit", "later"]);
  });

  it("saves each downloaded payload before fetching the next photo", async () => {
    const order: string[] = [];
    const firstBlob = new Blob(["first"]);
    const secondBlob = new Blob(["second"]);
    const download = vi.fn(async ({ id }: { id: string; byteSize: number }) => {
      order.push(`fetch:${id}`);
      const blob = id === "first" ? firstBlob : secondBlob;
      return { byteSize: blob.size, value: blob };
    });
    const save = vi.fn(async (item: { id: string; byteSize: number }, blob: Blob) => {
      expect(blob).toBe(item.id === "first" ? firstBlob : secondBlob);
      order.push(`save-start:${item.id}`);
      await Promise.resolve();
      order.push(`save-complete:${item.id}`);
    });

    const result = await downloadBulkPhotos([photo("first", 5), photo("second", 6)], download, save);

    expect(order).toEqual([
      "fetch:first", "save-start:first", "save-complete:first",
      "fetch:second", "save-start:second", "save-complete:second",
    ]);
    expect(result.downloaded.map((item) => item.id)).toEqual(["first", "second"]);
  });

  it("downloads sequentially, keeps going after errors, and returns retryable failures", async () => {
    const order: string[] = [];
    const download = vi.fn(async ({ id }: { id: string; byteSize: number }) => {
      order.push(id);
      if (id === "broken") throw new Error("Network unavailable");
      return { byteSize: 1, value: undefined };
    });

    const result = await downloadBulkPhotos([photo("first", 3), photo("broken", 5), photo("last", 7)], download);

    expect(order).toEqual(["first", "broken", "last"]);
    expect(result.downloaded.map((item) => item.id)).toEqual(["first", "last"]);
    expect(result.failed).toEqual([{ item: photo("broken", 5), error: "Network unavailable" }]);
  });
});
