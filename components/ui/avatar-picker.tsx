"use client";

import { Camera, Trash2, UserRound } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AvatarChange = { value: string | null; file?: File | null };

type Preset = { key: string; label: string; from: string; to: string; url: string };

function presetDataUrl(from: string, to: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>` +
    `</linearGradient></defs>` +
    `<rect width="80" height="80" rx="40" fill="url(#g)"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const PRESET_AVATARS: Preset[] = [
  { key: "indigo", label: "Indigo", from: "#6366f1", to: "#8b5cf6", url: presetDataUrl("#6366f1", "#8b5cf6") },
  { key: "cyan", label: "Cyan", from: "#06b6d4", to: "#3b82f6", url: presetDataUrl("#06b6d4", "#3b82f6") },
  { key: "green", label: "Green", from: "#10b981", to: "#84cc16", url: presetDataUrl("#10b981", "#84cc16") },
  { key: "amber", label: "Amber", from: "#f59e0b", to: "#f97316", url: presetDataUrl("#f59e0b", "#f97316") },
  { key: "rose", label: "Rose", from: "#ef4444", to: "#ec4899", url: presetDataUrl("#ef4444", "#ec4899") },
  { key: "slate", label: "Slate", from: "#64748b", to: "#94a3b8", url: presetDataUrl("#64748b", "#94a3b8") },
];

/** Read a local image into a small data URL (capped, so offline avatar values stay small). */
export function fileToDataUrl(file: File, maxSize = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the image."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That file is not a valid image."));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(String(reader.result));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function initialsOf(name?: string): string {
  return (name ?? "")
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function AvatarPicker({
  value,
  name,
  onChange,
  uploadHint,
}: {
  value: string | null;
  name?: string;
  onChange: (change: AvatarChange) => void;
  uploadHint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const shown = localPreview ?? value;

  function handleFile(file?: File | null) {
    if (!file) return;
    setLocalPreview(URL.createObjectURL(file));
    onChange({ value: null, file });
  }

  return (
    <div className="flex items-start gap-4">
      <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-full border bg-muted text-muted-foreground">
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt="" className="size-full object-cover" />
        ) : (
          <span className="grid size-full place-items-center text-lg font-semibold">
            {initialsOf(name) || <UserRound className="size-8" aria-hidden />}
          </span>
        )}
      </span>

      <div className="space-y-2.5">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Choose a preset avatar">
          {PRESET_AVATARS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              onClick={() => {
                setLocalPreview(null);
                onChange({ value: preset.url });
              }}
              aria-label={`Use ${preset.label} avatar`}
              className={cn(
                "size-10 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                value === preset.url ? "ring-2 ring-ring ring-offset-2" : "hover:ring-2 hover:ring-ring/50"
              )}
              style={{ background: `linear-gradient(135deg, ${preset.from}, ${preset.to})` }}
            />
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            <Camera className="size-4" /> Upload photo
          </Button>
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setLocalPreview(null);
                onChange({ value: null });
              }}
            >
              <Trash2 className="size-4" /> Remove
            </Button>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label="Upload avatar image"
          onChange={(event) => handleFile(event.target.files?.[0])}
        />

        {uploadHint && <p className="text-xs text-muted-foreground">{uploadHint}</p>}
      </div>
    </div>
  );
}
