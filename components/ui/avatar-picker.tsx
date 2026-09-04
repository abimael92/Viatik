"use client";

import { Camera, Dices, ImagePlus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  avatarDataUri,
  DEFAULT_AVATAR_STYLE,
  parseAvatarSeed,
  randomAvatarSeed,
  UserAvatar,
  type AvatarStyle,
} from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils";

export type AvatarChange = { seed: string | null; src: string | null; file?: File | null };

type AvatarOption = { seed: string; from: string; to: string; label: string };

const GRADIENTS = [
  { from: "#6366f1", to: "#8b5cf6" },
  { from: "#06b6d4", to: "#3b82f6" },
  { from: "#10b981", to: "#84cc16" },
  { from: "#f59e0b", to: "#f97316" },
  { from: "#ef4444", to: "#ec4899" },
  { from: "#64748b", to: "#94a3b8" },
];

// A grid of playfully generated DiceBear avatars on colored backgrounds.
const AVATAR_OPTIONS: AvatarOption[] = (
  ["adventurer", "bottts", "avataaars"] as AvatarStyle[]
).flatMap((style) =>
  GRADIENTS.map((gradient, index) => ({
    seed: `${style}|${style}-${index}`,
    from: gradient.from,
    to: gradient.to,
    label: `${style} ${index + 1}`,
  }))
);

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
  const [open, setOpen] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const style = parseAvatarSeed(seed).style;

  function select(option: AvatarOption) {
    setLocalPreview(null);
    onChange({ seed: option.seed, src: null });
    setOpen(false);
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
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
            <ImagePlus className="size-4" /> Select avatar
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={handleRandomize}>
            <Dices className="size-4" /> Randomize
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => inputRef.current?.click()}>
            <Camera className="size-4" /> Upload photo
          </Button>
          {(seed || src) && (
            <Button type="button" variant="ghost" size="sm" onClick={handleRemove}>
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Choose an avatar</DialogTitle>
            <DialogDescription>Pick a playful avatar or generate your own.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4" role="group" aria-label="Avatar options">
            {AVATAR_OPTIONS.map((option) => (
              <button
                key={option.seed}
                type="button"
                onClick={() => select(option)}
                aria-label={`Use ${option.label} avatar`}
                aria-pressed={seed === option.seed}
                className={cn(
                  "group relative aspect-square place-items-center overflow-hidden rounded-2xl transition",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  "hover:ring-2 hover:ring-ring/60",
                  seed === option.seed && "ring-2 ring-ring ring-offset-2"
                )}
                style={{ background: `linear-gradient(135deg, ${option.from}, ${option.to})` }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={avatarDataUri(option.seed)} alt="" className="size-full object-cover" />
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export { DEFAULT_AVATAR_STYLE };
