"use client";

import { ChevronLeft, ChevronRight, ExternalLink, ImagePlus, Link2, MapPin, Paperclip, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import imageCompression from "browser-image-compression";

import { getPlaceDetails, searchActivityPlaces, type PlaceSuggestion } from "@/app/actions/places";
import { Button } from "@/components/ui/button";
import { Collapsible } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  activityLinkHostname,
  activityLocationMapsUrl,
  createActivityImageAttachment,
  createActivityLinkAttachment,
  createActivityLocationAttachment,
  isAllowedActivityImage,
  MAX_ACTIVITY_ATTACHMENTS,
  normalizeActivityAttachments,
  referencedActivityMediaIds,
  type PendingActivityImage,
} from "@/features/activities/domain/activity-attachments";
import type { ActivityAttachment } from "@/features/domain/entities";
import type { TripMedia } from "@/features/domain/entities-media";
import { mediaRepository } from "@/features/media/data/dexie-media-repository";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { useSyncStatus } from "@/lib/sync/use-sync-status";

const EXTRA_ADD =
  "w-full border-amber-400 bg-gradient-to-b from-amber-300 to-orange-500 text-amber-950 hover:brightness-105 dark:border-amber-600 dark:from-amber-600 dark:to-orange-800 dark:text-amber-50";
const EXTRA_SAVE =
  "border-transparent bg-gradient-to-b from-sky-400 to-sky-600 text-white hover:brightness-105 dark:from-sky-500 dark:to-sky-800";
const EXTRA_CANCEL =
  "border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";
const MENU_PHOTO = "text-amber-950 focus:bg-amber-100 dark:text-amber-100 dark:focus:bg-amber-900";
const MENU_LINK = "text-sky-950 focus:bg-sky-100 dark:text-sky-100 dark:focus:bg-sky-900";
const MENU_PIN = "text-teal-950 focus:bg-teal-100 dark:text-teal-100 dark:focus:bg-teal-900";

const COMPRESSION_OPTIONS = {
  maxSizeMB: 0.5,
  maxWidthOrHeight: 1600,
  useWebWorker: true,
};

function useAttachmentMedia(ids: readonly string[]) {
  const [media, setMedia] = useState<TripMedia[]>([]);
  const key = ids.join(",");
  useEffect(() => mediaRepository.watchByIds(key ? key.split(",") : [], setMedia), [key]);
  return media;
}

function useMediaPreviewUrl(media: TripMedia | undefined, pending?: PendingActivityImage): string {
  const objectUrl = useMemo(() => {
    if (media?.uploadedUrl) return null;
    const blob = pending?.blob ?? media?.blob ?? null;
    return blob ? URL.createObjectURL(blob) : null;
  }, [media?.uploadedUrl, media?.blob, pending?.blob]);

  useEffect(() => () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }, [objectUrl]);

  return media?.uploadedUrl ?? objectUrl ?? "";
}

export function ActivityAttachmentsSection({
  attachments,
  pendingImages = [],
}: {
  attachments: readonly ActivityAttachment[];
  pendingImages?: readonly PendingActivityImage[];
}) {
  const { t } = useI18n();
  const items = normalizeActivityAttachments(attachments);
  const media = useAttachmentMedia(referencedActivityMediaIds(items));
  const mediaById = new Map(media.map((item) => [item.id, item]));
  const pendingById = new Map(pendingImages.map((item) => [item.id, item]));
  const images = items.filter((item): item is Extract<ActivityAttachment, { kind: "image" }> => item.kind === "image");
  const [lightbox, setLightbox] = useState<{ open: boolean; index: number }>({ open: false, index: 0 });

  if (items.length === 0) return null;

  return (
    <section className="space-y-3" aria-labelledby="activity-attachments-heading">
      <h3 id="activity-attachments-heading" className="flex items-center gap-2 text-sm font-semibold">
        <Paperclip className="size-4 text-primary" aria-hidden />
        {t("common.activityAttachmentsSection")}
      </h3>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label={t("common.activityAttachmentsList")}>
        {items.map((item) => (
          <li key={item.id}>
            {item.kind === "image" ? (
              <AttachmentImageButton
                item={item}
                media={mediaById.get(item.mediaId)}
                pending={pendingById.get(item.mediaId)}
                overflowLabel={null}
                onOpen={() => setLightbox({ open: true, index: images.findIndex((image) => image.id === item.id) })}
              />
            ) : item.kind === "link" ? (
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="flex aspect-square flex-col justify-between rounded-xl border border-border bg-background p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t("common.activityAttachmentsOpenLink", { name: item.title })}
              >
                <Link2 className="size-6 text-primary" aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{item.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {item.siteName ?? activityLinkHostname(item.url)}
                  </span>
                </span>
                <ExternalLink className="size-4 text-muted-foreground" aria-hidden />
              </a>
            ) : (
              <a
                href={activityLocationMapsUrl(item)}
                target="_blank"
                rel="noreferrer"
                className="flex aspect-square flex-col justify-between rounded-xl border border-border bg-background p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t("common.activityAttachmentsOpenMaps", { name: item.name })}
              >
                <MapPin className="size-6 text-primary" aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{item.name}</span>
                  {item.formattedAddress && (
                    <span className="block truncate text-xs text-muted-foreground">{item.formattedAddress}</span>
                  )}
                </span>
              </a>
            )}
          </li>
        ))}
      </ul>
      <ActivityMediaLightbox
        images={images}
        mediaById={mediaById}
        pendingById={pendingById}
        open={lightbox.open}
        index={lightbox.index}
        onOpenChange={(open) => setLightbox((current) => ({ ...current, open }))}
        onIndexChange={(index) => setLightbox((current) => ({ ...current, index }))}
      />
    </section>
  );
}

function AttachmentImageButton({
  item,
  media,
  pending,
  overflowLabel,
  onOpen,
}: {
  item: Extract<ActivityAttachment, { kind: "image" }>;
  media?: TripMedia;
  pending?: PendingActivityImage;
  overflowLabel: string | null;
  onOpen: () => void;
}) {
  const { t } = useI18n();
  const preview = useMediaPreviewUrl(media, pending);
  return (
    <button
      type="button"
      className="relative aspect-square overflow-hidden rounded-xl border border-border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      aria-label={t("common.activityAttachmentsViewPhoto", { name: item.caption ?? item.altText ?? item.id })}
      onClick={onOpen}
    >
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt={item.altText ?? item.caption ?? ""} className="h-full w-full object-contain" />
      ) : (
        <span className="flex h-full items-center justify-center px-2 text-center text-xs text-muted-foreground">
          {t("common.activityAttachmentsSyncing")}
        </span>
      )}
      {overflowLabel && (
        <span className="absolute inset-0 flex items-center justify-center bg-background/70 text-sm font-semibold">
          {overflowLabel}
        </span>
      )}
    </button>
  );
}

function ActivityMediaLightbox({
  images,
  mediaById,
  pendingById,
  open,
  index,
  onOpenChange,
  onIndexChange,
}: {
  images: Extract<ActivityAttachment, { kind: "image" }>[];
  mediaById: Map<string, TripMedia>;
  pendingById: Map<string, PendingActivityImage>;
  open: boolean;
  index: number;
  onOpenChange: (open: boolean) => void;
  onIndexChange: (index: number) => void;
}) {
  const { t } = useI18n();
  const current = images[index];
  const src = useMediaPreviewUrl(
    current ? mediaById.get(current.mediaId) : undefined,
    current ? pendingById.get(current.mediaId) : undefined,
  );

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      onIndexChange((index - 1 + images.length) % images.length);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      onIndexChange((index + 1) % images.length);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl border-0 bg-transparent p-0 shadow-none" onKeyDown={handleKeyDown}>
        <DialogTitle className="sr-only">{t("common.activityAttachmentsPhotoPreview")}</DialogTitle>
        <DialogDescription className="sr-only">{t("common.activityAttachmentsPhotoBrowseHelp")}</DialogDescription>
        <div className="relative flex items-center justify-center">
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={current?.altText ?? current?.caption ?? ""} className="max-h-[85vh] max-w-full rounded-lg object-contain" />
          ) : (
            <p className="rounded-lg bg-background/90 px-4 py-3 text-sm">{t("common.activityAttachmentsSyncing")}</p>
          )}
          {images.length > 1 && (
            <>
              <button
                type="button"
                className="absolute left-2 top-1/2 size-11 -translate-y-1/2 rounded-full bg-background/80 text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t("common.previousPhoto")}
                onClick={() => onIndexChange((index - 1 + images.length) % images.length)}
              >
                <ChevronLeft className="mx-auto size-6" aria-hidden />
              </button>
              <button
                type="button"
                className="absolute right-2 top-1/2 size-11 -translate-y-1/2 rounded-full bg-background/80 text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t("common.nextPhoto")}
                onClick={() => onIndexChange((index + 1) % images.length)}
              >
                <ChevronRight className="mx-auto size-6" aria-hidden />
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ActivityAttachmentsEditor({
  attachments,
  pendingImages,
  onChange,
  defaultOpen,
}: {
  attachments: ActivityAttachment[];
  pendingImages: PendingActivityImage[];
  onChange: (attachments: ActivityAttachment[], pendingImages: PendingActivityImage[]) => void;
  defaultOpen?: boolean;
}) {
  const { t } = useI18n();
  const sync = useSyncStatus();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState<"link" | "location" | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [linkDescription, setLinkDescription] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const atLimit = attachments.length >= MAX_ACTIVITY_ATTACHMENTS;
  const media = useAttachmentMedia(referencedActivityMediaIds(attachments));

  function update(next: ActivityAttachment[], nextPending = pendingImages) {
    onChange(normalizeActivityAttachments(next), nextPending);
  }

  function removeItem(id: string) {
    const removed = attachments.find((item) => item.id === id);
    update(
      attachments.filter((item) => item.id !== id),
      pendingImages.filter((item) => item.id !== (removed?.kind === "image" ? removed.mediaId : "")),
    );
  }

  async function addPhoto(files: FileList | null) {
    const file = files?.[0];
    if (!file || atLimit) return;
    if (!isAllowedActivityImage(file)) {
      setImageError(t("common.activityAttachmentsInvalidImage"));
      return;
    }
    setImageError(null);
    setPreparing(true);
    try {
      const compressed = await imageCompression(file, COMPRESSION_OPTIONS);
      const mediaId = crypto.randomUUID();
      const attachment = createActivityImageAttachment(mediaId);
      if (!attachment) return;
      update([...attachments, attachment], [...pendingImages, { id: mediaId, blob: compressed, caption: null }]);
    } catch {
      setImageError(t("common.activityAttachmentsInvalidImage"));
    } finally {
      setPreparing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function saveLink() {
    const attachment = createActivityLinkAttachment(linkUrl, {
      title: linkTitle,
      description: linkDescription,
    });
    if (!attachment) {
      setLinkError(t("common.activityAttachmentsInvalidUrl"));
      return;
    }
    if (atLimit) return;
    update([...attachments, attachment]);
    setAdding(null);
    setLinkUrl("");
    setLinkTitle("");
    setLinkDescription("");
    setLinkError(null);
  }

  return (
    <Collapsible
      id="activity-attachments"
      title={t("common.activityAttachments")}
      defaultOpen={defaultOpen ?? attachments.length > 0}
      className="border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40"
      triggerClassName="bg-amber-200 text-amber-950 hover:bg-amber-300 dark:bg-amber-800 dark:text-amber-50 dark:hover:bg-amber-700"
      badge={
        attachments.length > 0 ? (
          <span className="rounded-full border border-amber-400 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900 dark:border-amber-600 dark:bg-amber-900 dark:text-amber-100">
            {attachments.length}
          </span>
        ) : null
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">{t("common.activityAttachmentsHelp")}</p>
        {attachments.length === 0 ? (
          <p className="rounded-xl border border-border bg-muted/40 px-3 py-8 text-center text-sm text-muted-foreground">
            {t("common.activityAttachmentsEmpty")}
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label={t("common.activityAttachmentsList")}>
            {attachments.map((item) => (
              <li key={item.id}>
                <EditorGalleryCard
                  item={item}
                  media={media}
                  pendingImages={pendingImages}
                  onRemove={() => removeItem(item.id)}
                />
              </li>
            ))}
          </ul>
        )}

        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="sr-only" onChange={(event) => void addPhoto(event.target.files)} />

        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" className={EXTRA_ADD} disabled={atLimit}>
              <Plus aria-hidden />
              {atLimit ? t("common.activityAttachmentsLimit") : t("common.activityAttachmentsAdd")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width)">
            <DropdownMenuItem className={MENU_PHOTO} onSelect={() => fileInputRef.current?.click()}>
              <ImagePlus aria-hidden />
              {t("common.activityAttachmentsAddPhoto")}
            </DropdownMenuItem>
            <DropdownMenuItem className={MENU_LINK} onSelect={() => setAdding("link")}>
              <Link2 aria-hidden />
              {t("common.activityAttachmentsAddLink")}
            </DropdownMenuItem>
            <DropdownMenuItem className={MENU_PIN} onSelect={() => setAdding("location")}>
              <MapPin aria-hidden />
              {t("common.activityAttachmentsAddLocation")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div role="status" aria-live="polite" className="text-xs text-muted-foreground">
          {preparing && t("common.activityAttachmentsPreparing")}
          {!preparing && pendingImages.length > 0 && t("common.activityAttachmentsReady")}
          {!preparing && pendingImages.length === 0 && media.some((item) => item.uploadStatus === "pending" || item.uploadStatus === "uploading") &&
            (sync.isOnline ? t("common.activityAttachmentsUploading") : t("common.activityAttachmentsPending"))}
          {media.some((item) => item.uploadStatus === "failed") && t("common.activityAttachmentsUploadFailed")}
          {imageError}
        </div>

        {adding === "link" && (
          <div className="space-y-2 rounded-xl border border-border/60 bg-muted/30 p-3" role="region" aria-label={t("common.activityAttachmentsAddLink")}>
            <Label htmlFor="activity-attachment-url">{t("common.activityAttachmentsUrl")}</Label>
            <Input id="activity-attachment-url" value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://" />
            <Label htmlFor="activity-attachment-title">{t("common.activityAttachmentsLinkTitle")}</Label>
            <Input id="activity-attachment-title" value={linkTitle} onChange={(event) => setLinkTitle(event.target.value)} />
            <Label htmlFor="activity-attachment-description">{t("common.activityAttachmentsLinkDescription")}</Label>
            <Input id="activity-attachment-description" value={linkDescription} onChange={(event) => setLinkDescription(event.target.value)} />
            {linkError && <p role="alert" className="text-sm text-destructive">{linkError}</p>}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" className={EXTRA_CANCEL} onClick={() => setAdding(null)}>{t("common.cancel")}</Button>
              <Button type="button" variant="default" className={EXTRA_SAVE} onClick={saveLink}>{t("common.activityAttachmentsSaveLink")}</Button>
            </div>
          </div>
        )}

        {adding === "location" && (
          <AttachmentPlaceSearch
            onSelect={(details) => {
              const attachment = createActivityLocationAttachment({
                name: details.name,
                formattedAddress: details.formattedAddress,
                latitude: details.latitude,
                longitude: details.longitude,
                placeId: details.placeId,
              });
              if (attachment && !atLimit) update([...attachments, attachment]);
              setAdding(null);
            }}
            onCancel={() => setAdding(null)}
          />
        )}
      </div>
    </Collapsible>
  );
}

function EditorGalleryCard({
  item,
  media,
  pendingImages,
  onRemove,
}: {
  item: ActivityAttachment;
  media: TripMedia[];
  pendingImages: PendingActivityImage[];
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const label = item.kind === "location" ? item.name : item.kind === "link" ? item.title : item.caption ?? t("common.activityAttachmentsAddPhoto");
  const imageMedia = item.kind === "image" ? media.find((entry) => entry.id === item.mediaId) : undefined;
  const pending = item.kind === "image" ? pendingImages.find((entry) => entry.id === item.mediaId) : undefined;
  const preview = useMediaPreviewUrl(imageMedia, pending);

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-muted">
      {item.kind === "image" ? (
        <div className="aspect-square bg-muted">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt={item.altText ?? item.caption ?? ""} className="h-full w-full object-contain" />
          ) : (
            <span className="flex h-full items-center justify-center px-3 text-center text-xs text-muted-foreground">
              {t("common.activityAttachmentsSyncing")}
            </span>
          )}
        </div>
      ) : (
        <div className="flex aspect-square flex-col justify-between bg-background p-3">
          {item.kind === "link" ? <Link2 className="size-6 text-primary" aria-hidden /> : <MapPin className="size-6 text-primary" aria-hidden />}
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{item.kind === "link" ? item.title : item.name}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {item.kind === "link" ? activityLinkHostname(item.url) : item.formattedAddress}
            </span>
          </span>
        </div>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-1 top-1 size-11 border border-border bg-background hover:bg-muted"
        aria-label={t("common.activityAttachmentsRemove", { name: label })}
        onClick={onRemove}
      >
        <Trash2 aria-hidden />
      </Button>
      {imageMedia?.uploadStatus === "failed" && (
        <button
          type="button"
          className="absolute inset-x-2 bottom-2 min-h-11 rounded-lg bg-background/90 px-2 text-xs font-medium text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t("common.activityAttachmentsRetry")}
          onClick={() => void mediaRepository.retry(imageMedia.id)}
        >
          {t("common.activityAttachmentsRetry")}
        </button>
      )}
    </div>
  );
}

function AttachmentPlaceSearch({
  onSelect,
  onCancel,
}: {
  onSelect: (details: { name: string; formattedAddress: string; latitude: number; longitude: number; placeId: string }) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const searchVersion = useRef(0);

  useEffect(() => {
    const version = ++searchVersion.current;
    const timer = window.setTimeout(async () => {
      if (value.trim().length < 2) return setSuggestions([]);
      const result = await searchActivityPlaces(value);
      if (version === searchVersion.current) setSuggestions(result.suggestions);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [value]);

  return (
    <div className="space-y-2 rounded-xl border border-border/60 bg-muted/30 p-3" role="region" aria-label={t("common.activityAttachmentsAddLocation")}>
      <Label htmlFor="activity-attachment-place">{t("common.searchPlace")}</Label>
      <Input id="activity-attachment-place" value={value} onChange={(event) => setValue(event.target.value)} autoComplete="off" />
      {suggestions.length > 0 && (
        <div data-places-suggestions className="overflow-hidden rounded-xl border bg-popover">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.placeId}
              type="button"
              className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm hover:bg-muted"
              onMouseDown={(event) => event.preventDefault()}
              onClick={async () => {
                const details = await getPlaceDetails(suggestion.placeId, suggestion.label);
                if (details) onSelect(details);
              }}
            >
              <MapPin className="size-5 text-primary" aria-hidden />
              {suggestion.label}
            </button>
          ))}
        </div>
      )}
      <Button type="button" variant="outline" className={EXTRA_CANCEL} onClick={onCancel}>{t("common.cancel")}</Button>
    </div>
  );
}
