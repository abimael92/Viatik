import type {
  ActivityAttachment,
  ActivityImageAttachment,
  ActivityLinkAttachment,
  ActivityLocationAttachment,
} from "@/features/domain/entities";

export const MAX_ACTIVITY_ATTACHMENTS = 8;
export const MAX_ACTIVITY_ATTACHMENT_TEXT_LENGTH = 240;
export const MAX_ACTIVITY_ATTACHMENT_URL_LENGTH = 2048;
export const MAX_ACTIVITY_ATTACHMENT_IMAGE_BYTES = 10 * 1024 * 1024;
export const ACTIVITY_ATTACHMENT_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export interface PendingActivityImage {
  id: string;
  blob: Blob;
  caption: string | null;
}

function boundedText(value: unknown, max = MAX_ACTIVITY_ATTACHMENT_TEXT_LENGTH): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().slice(0, max);
  return normalized || null;
}

function normalizedHttpUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > MAX_ACTIVITY_ATTACHMENT_URL_LENGTH) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return null;
  }
}

/** Normalize untrusted Activity attachment manifests without retaining local media fields. */
export function normalizeActivityAttachments(value: unknown): ActivityAttachment[] {
  if (!Array.isArray(value)) return [];

  const seenIds = new Set<string>();
  return value.slice(0, MAX_ACTIVITY_ATTACHMENTS).flatMap((entry): ActivityAttachment[] => {
    if (!entry || typeof entry !== "object") return [];
    const candidate = entry as Record<string, unknown>;
    const id = boundedText(candidate.id, 120);
    if (!id || seenIds.has(id)) return [];
    seenIds.add(id);

    if (candidate.kind === "image") {
      const mediaId = boundedText(candidate.mediaId ?? candidate.media_id, 120);
      if (!mediaId) return [];
      return [{
        id,
        kind: "image" as const,
        mediaId,
        caption: boundedText(candidate.caption),
        altText: boundedText(candidate.altText ?? candidate.alt_text),
      }];
    }

    if (candidate.kind === "link") {
      const url = normalizedHttpUrl(candidate.url);
      if (!url) return [];
      const title = boundedText(candidate.title) ?? new URL(url).hostname;
      return [{
        id,
        kind: "link" as const,
        url,
        title,
        description: boundedText(candidate.description),
        siteName: boundedText(candidate.siteName ?? candidate.site_name, 120),
        previewImageMediaId: boundedText(
          candidate.previewImageMediaId ?? candidate.preview_image_media_id,
          120,
        ),
      }];
    }

    if (candidate.kind === "location") {
      const name = boundedText(candidate.name);
      const latitude = Number(candidate.latitude);
      const longitude = Number(candidate.longitude);
      if (
        !name ||
        !Number.isFinite(latitude) ||
        latitude < -90 ||
        latitude > 90 ||
        !Number.isFinite(longitude) ||
        longitude < -180 ||
        longitude > 180
      ) {
        return [];
      }
      return [{
        id,
        kind: "location" as const,
        name,
        formattedAddress: boundedText(
          candidate.formattedAddress ?? candidate.formatted_address,
        ),
        latitude,
        longitude,
        placeId: boundedText(candidate.placeId ?? candidate.place_id, 240),
      }];
    }

    return [];
  });
}

export function referencedActivityMediaIds(
  attachments: readonly ActivityAttachment[] | null | undefined,
): string[] {
  const ids = new Set<string>();
  for (const attachment of attachments ?? []) {
    if (attachment.kind === "image") ids.add(attachment.mediaId);
    if (attachment.kind === "link" && attachment.previewImageMediaId) {
      ids.add(attachment.previewImageMediaId);
    }
  }
  return [...ids];
}

export function isAllowedActivityImage(file: Pick<File, "type" | "size">): boolean {
  return (
    ACTIVITY_ATTACHMENT_IMAGE_TYPES.includes(
      file.type as (typeof ACTIVITY_ATTACHMENT_IMAGE_TYPES)[number],
    ) && file.size <= MAX_ACTIVITY_ATTACHMENT_IMAGE_BYTES
  );
}

export function createActivityImageAttachment(
  mediaId: string,
  options: { id?: string; caption?: string | null; altText?: string | null } = {},
): ActivityImageAttachment | null {
  const normalized = normalizeActivityAttachments([{
    id: options.id ?? crypto.randomUUID(),
    kind: "image",
    mediaId,
    caption: options.caption ?? null,
    altText: options.altText ?? null,
  }]);
  return normalized[0]?.kind === "image" ? normalized[0] : null;
}

export function createActivityLinkAttachment(
  url: string,
  options: {
    id?: string;
    title?: string | null;
    description?: string | null;
    siteName?: string | null;
    previewImageMediaId?: string | null;
  } = {},
): ActivityLinkAttachment | null {
  const normalized = normalizeActivityAttachments([{
    id: options.id ?? crypto.randomUUID(),
    kind: "link",
    url,
    title: options.title ?? "",
    description: options.description ?? null,
    siteName: options.siteName ?? null,
    previewImageMediaId: options.previewImageMediaId ?? null,
  }]);
  return normalized[0]?.kind === "link" ? normalized[0] : null;
}

export function createActivityLocationAttachment(
  input: {
    id?: string;
    name: string;
    formattedAddress?: string | null;
    latitude: number;
    longitude: number;
    placeId?: string | null;
  },
): ActivityLocationAttachment | null {
  const normalized = normalizeActivityAttachments([{
    id: input.id ?? crypto.randomUUID(),
    kind: "location",
    name: input.name,
    formattedAddress: input.formattedAddress ?? null,
    latitude: input.latitude,
    longitude: input.longitude,
    placeId: input.placeId ?? null,
  }]);
  return normalized[0]?.kind === "location" ? normalized[0] : null;
}

export function activityLocationMapsUrl(attachment: ActivityLocationAttachment): string {
  const params = new URLSearchParams({
    api: "1",
    query: attachment.placeId
      ? attachment.name
      : `${attachment.latitude},${attachment.longitude}`,
  });
  if (attachment.placeId) params.set("query_place_id", attachment.placeId);
  return `https://www.google.com/maps/search/?${params.toString()}`;
}

export function activityLinkHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
