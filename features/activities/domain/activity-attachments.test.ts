import { describe, expect, it } from "vitest";

import {
  activityLinkHostname,
  activityLocationMapsUrl,
  createActivityImageAttachment,
  createActivityLinkAttachment,
  createActivityLocationAttachment,
  isAllowedActivityImage,
  MAX_ACTIVITY_ATTACHMENTS,
  MAX_ACTIVITY_ATTACHMENT_IMAGE_BYTES,
  MAX_ACTIVITY_ATTACHMENT_TEXT_LENGTH,
  normalizeActivityAttachments,
  referencedActivityMediaIds,
} from "@/features/activities/domain/activity-attachments";

describe("normalizeActivityAttachments", () => {
  it("returns an empty list for missing or invalid payloads", () => {
    expect(normalizeActivityAttachments(undefined)).toEqual([]);
    expect(normalizeActivityAttachments(null)).toEqual([]);
    expect(normalizeActivityAttachments("nope")).toEqual([]);
    expect(normalizeActivityAttachments([{ kind: "image", id: "a" }])).toEqual([]);
  });

  it("normalizes each attachment kind and accepts ingest aliases", () => {
    expect(
      normalizeActivityAttachments([
        {
          id: "img-1",
          kind: "image",
          media_id: "media-1",
          caption: "  Gate photo  ",
          alt_text: "Airport gate",
          blob: "data:image/png;base64,abc",
          uploadedUrl: "https://signed.example/photo",
          storagePath: "trip/media.jpg",
        },
        {
          id: "link-1",
          kind: "link",
          url: "https://user:secret@example.com/menu",
          title: "  Dinner  ",
          site_name: "Example",
          preview_image_media_id: "media-2",
        },
        {
          id: "pin-1",
          kind: "location",
          name: " Prado ",
          formatted_address: "Madrid",
          latitude: 40.4138,
          longitude: -3.6921,
          place_id: "place-1",
        },
      ]),
    ).toEqual([
      {
        id: "img-1",
        kind: "image",
        mediaId: "media-1",
        caption: "Gate photo",
        altText: "Airport gate",
      },
      {
        id: "link-1",
        kind: "link",
        url: "https://example.com/menu",
        title: "Dinner",
        description: null,
        siteName: "Example",
        previewImageMediaId: "media-2",
      },
      {
        id: "pin-1",
        kind: "location",
        name: "Prado",
        formattedAddress: "Madrid",
        latitude: 40.4138,
        longitude: -3.6921,
        placeId: "place-1",
      },
    ]);
  });

  it("drops unknown kinds, duplicate ids, invalid urls, and out-of-range coordinates", () => {
    expect(
      normalizeActivityAttachments([
        { id: "dup", kind: "image", mediaId: "media-1" },
        { id: "dup", kind: "link", url: "https://example.com" },
        { id: "bad-url", kind: "link", url: "javascript:alert(1)" },
        { id: "ftp", kind: "link", url: "ftp://files.example.com/a" },
        { id: "bad-pin", kind: "location", name: "Nowhere", latitude: 200, longitude: 0 },
        { id: "video", kind: "video", mediaId: "media-9" },
      ]),
    ).toEqual([
      { id: "dup", kind: "image", mediaId: "media-1", caption: null, altText: null },
    ]);
  });

  it("bounds list length and text length", () => {
    const longCaption = "x".repeat(MAX_ACTIVITY_ATTACHMENT_TEXT_LENGTH + 20);
    const items = Array.from({ length: MAX_ACTIVITY_ATTACHMENTS + 4 }, (_, index) => ({
      id: `img-${index}`,
      kind: "image",
      mediaId: `media-${index}`,
      caption: index === 0 ? longCaption : `Photo ${index}`,
    }));

    const normalized = normalizeActivityAttachments(items);
    expect(normalized).toHaveLength(MAX_ACTIVITY_ATTACHMENTS);
    expect(normalized[0]).toMatchObject({ caption: "x".repeat(MAX_ACTIVITY_ATTACHMENT_TEXT_LENGTH) });
  });
});

describe("attachment factories and helpers", () => {
  it("creates valid attachments and rejects invalid links", () => {
    expect(createActivityImageAttachment("media-1", { id: "img-1", caption: "Gate" })).toEqual({
      id: "img-1",
      kind: "image",
      mediaId: "media-1",
      caption: "Gate",
      altText: null,
    });
    expect(createActivityLinkAttachment("https://example.com/menu", { id: "link-1" })).toMatchObject({
      id: "link-1",
      kind: "link",
      url: "https://example.com/menu",
      title: "example.com",
    });
    expect(createActivityLinkAttachment("not-a-url")).toBeNull();
    expect(
      createActivityLocationAttachment({
        id: "pin-1",
        name: "Prado",
        latitude: 40.4,
        longitude: -3.7,
      }),
    ).toMatchObject({ id: "pin-1", kind: "location", name: "Prado" });
  });

  it("collects referenced media ids and builds a maps url", () => {
    const attachments = normalizeActivityAttachments([
      { id: "img-1", kind: "image", mediaId: "media-1" },
      { id: "link-1", kind: "link", url: "https://www.example.com/x", previewImageMediaId: "media-2" },
      { id: "pin-1", kind: "location", name: "Prado", latitude: 40.4, longitude: -3.7, placeId: "place-1" },
    ]);

    expect(referencedActivityMediaIds(attachments)).toEqual(["media-1", "media-2"]);
    expect(activityLinkHostname(attachments[1] && attachments[1].kind === "link" ? attachments[1].url : "")).toBe("example.com");
    expect(activityLocationMapsUrl(attachments[2] as never)).toContain("query_place_id=place-1");
  });

  it("accepts only bounded image files", () => {
    expect(isAllowedActivityImage({ type: "image/jpeg", size: 1024 })).toBe(true);
    expect(isAllowedActivityImage({ type: "application/pdf", size: 1024 })).toBe(false);
    expect(isAllowedActivityImage({ type: "image/png", size: MAX_ACTIVITY_ATTACHMENT_IMAGE_BYTES + 1 })).toBe(false);
  });
});
