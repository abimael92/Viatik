"use client";

import { createAvatar, type Style } from "@dicebear/core";
import { adventurer, avataaars, bottts } from "@dicebear/collection";
import { useMemo } from "react";

import { cn } from "@/lib/utils";

// DiceBear styles each have distinct option types; unify them here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const STYLES: Record<string, Style<any>> = { adventurer, avataaars, bottts };
export type AvatarStyle = keyof typeof STYLES;
export const DEFAULT_AVATAR_STYLE: AvatarStyle = "adventurer";

export type PresenceStatus = "online" | "offline" | "syncing";

/**
 * Parse a persisted seed of the form "style|seed" (style optional). Falls back
 * to the default style and a stable "viatik" seed when nothing is provided.
 */
export function parseAvatarSeed(seed?: string | null): { style: AvatarStyle; seed: string } {
  const raw = (seed ?? "").trim();
  if (!raw) return { style: DEFAULT_AVATAR_STYLE, seed: "viatik" };
  const [candidate, ...rest] = raw.split("|");
  if (candidate in STYLES) {
    return { style: candidate as AvatarStyle, seed: rest.join("|") || "viatik" };
  }
  return { style: DEFAULT_AVATAR_STYLE, seed: raw };
}

/** Produce a randomizable seed string (optionally style-scoped) for the picker. */
export function randomAvatarSeed(style: AvatarStyle = DEFAULT_AVATAR_STYLE): string {
  const random = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`).slice(0, 12);
  return `${style}|${random}`;
}

/** Render a DiceBear avatar for a seed as a data URI (used by the picker grid). */
export function avatarDataUri(seed: string): string {
  const { style, seed: parsed } = parseAvatarSeed(seed);
  return createAvatar(STYLES[style], { seed: parsed, size: 96 }).toDataUri();
}

const SIZES = {
  sm: "size-8 text-xs",
  md: "size-11 text-base",
  lg: "size-14 text-lg",
} as const;

function initialsOf(name?: string | null): string {
  return (name ?? "")
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function UserAvatar({
  seed,
  src,
  name,
  size = "md",
  status,
  className,
  "aria-label": ariaLabel,
}: {
  seed?: string | null;
  src?: string | null;
  name?: string | null;
  size?: keyof typeof SIZES;
  status?: PresenceStatus;
  className?: string;
  "aria-label"?: string;
}) {
  const dataUri = useMemo(() => {
    if (src) return null;
    if (!seed || !seed.trim()) return null;
    const { style, seed: parsed } = parseAvatarSeed(seed);
    return createAvatar(STYLES[style], { seed: parsed, size: 128 }).toDataUri();
  }, [seed, src]);

  const initials = initialsOf(name);

  return (
    <span
      className={cn("relative inline-flex shrink-0", className)}
      aria-label={ariaLabel ?? (name ?? undefined)}
    >
      <span
        className={cn(
          "grid place-items-center overflow-hidden rounded-full bg-primary/10 font-semibold",
          SIZES[size]
        )}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="size-full object-cover" />
        ) : dataUri ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={dataUri} alt="" className="size-full object-cover" />
        ) : (
          <span className="text-current">{initials || "?"}</span>
        )}
      </span>
      {status && <PresenceDot status={status} />}
    </span>
  );
}

function PresenceDot({ status }: { status: PresenceStatus }) {
  const color =
    status === "online" ? "bg-success" : status === "syncing" ? "bg-accent" : "bg-muted-foreground";
  return (
    <span
      className={cn(
        "absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-background",
        color,
        status === "syncing" && "animate-pulse"
      )}
      aria-hidden
    />
  );
}
