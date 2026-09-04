"use client";

import { Camera, Dices, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DEFAULT_AVATAR_STYLE,
  parseAvatarSeed,
  randomAvatarSeed,
  UserAvatar,
  type AvatarStyle,
} from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils";

export type AvatarChange = { seed: string | null; src: string | null; file?: File | null };

const STYLE_OPTIONS: { value: AvatarStyle; label: string }[] = [
  { value: "adventurer", label: "Adventurer" },
  { value: "bottts", label: "Bottts" },
  { value: "avataaars", label: "Avatar" },
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

export function AvatarPicker({
  seed,
  src,
  name,
  onChange,
  uploadHint,
}: {
  seed: string | null;
  src: string | null;
  name?: string;
  onChange: (change: AvatarChange) => void;
  uploadHint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const style = parseAvatarSeed(seed).style;

  function handleStyleChange(next: AvatarStyle) {
    const { seed: body } = parseAvatarSeed(seed);
    setLocalPreview(null);
    onChange({ seed: `${next}|${body}`, src: null });
  }

  function handleRandomize() {
    setLocalPreview(null);
    onChange({ seed: randomAvatarSeed(style), src: null });
  }

  function handleFile(file?: File | null) {
    if (!file) return;
    setLocalPreview(URL.createObjectURL(file));
    onChange({ seed: null, src: null, file });
  }

  function handleRemove() {
    setLocalPreview(null);
    onChange({ seed: null, src: null });
  }

  return (
    <div className="flex items-start gap-4">
      <UserAvatar seed={seed} src={localPreview ?? src} name={name} size="lg" />

      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleRandomize}>
            <Dices className="size-4" /> Randomize
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            <Camera className="size-4" /> Upload photo
          </Button>
          {(seed || src) && (
            <Button type="button" variant="ghost" size="sm" onClick={handleRemove}>
              <Trash2 className="size-4" /> Remove
            </Button>
          )}
        </div>

        <div role="group" aria-label="Avatar style" className="flex flex-wrap gap-1.5">
          {STYLE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleStyleChange(option.value)}
              aria-pressed={style === option.value}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                style === option.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted"
              )}
            >
              {option.label}
            </button>
          ))}
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

export { DEFAULT_AVATAR_STYLE };
